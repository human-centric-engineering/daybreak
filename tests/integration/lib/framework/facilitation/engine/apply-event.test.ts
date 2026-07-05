/**
 * `applyEvent` (f-engine t-3) — the sole validated writer.
 *
 * No live DB (house style): `executeTransaction` is forwarded to a `tx` mock (the
 * `appendSlotValue` test pattern), and the availability check runs the *real* pure
 * `computeAvailability` over an in-memory graph. Proves: an accepted transition
 * writes event + projection in one transaction with the right once/repeatable state
 * and `userId`; a refused transition (unavailable / unknown / not-active) writes
 * nothing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { txMock } = vi.hoisted(() => ({
  txMock: {
    userNodeState: { findUnique: vi.fn(), upsert: vi.fn() },
    journeyEvent: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db/utils', () => ({
  executeTransaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
}));

import { applyEvent, ENGINE_EVENT_TYPE } from '@/lib/framework/facilitation/engine/apply-event';
import type { ApplyEventInput, Transition } from '@/lib/framework/facilitation/engine/apply-event';
import { inMemoryGraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import { executeTransaction } from '@/lib/db/utils';
import type { JourneyNodeState } from '@/lib/framework/facilitation/engine/availability';
import type { MapNode, MapEdge } from '@/lib/framework/facilitation/map/schema';

const NOW = new Date('2026-07-05T12:00:00Z');

function node(key: string, extra: Partial<MapNode> = {}): MapNode {
  return { key, type: 'milestone', completionMode: 'once', ...extra };
}
function nstate(
  nodeKey: string,
  status: string,
  extra: Partial<JourneyNodeState> = {}
): JourneyNodeState {
  return { nodeKey, status, firstEnteredAt: null, lastActiveAt: null, ...extra };
}
function makeInput(over: {
  transition?: Partial<Transition>;
  nodes?: MapNode[];
  edges?: MapEdge[];
  nodeStates?: JourneyNodeState[];
}): ApplyEventInput {
  return {
    transition: { userId: 'u1', journeyId: 'j1', nodeKey: 'a', kind: 'enter', ...over.transition },
    graph: inMemoryGraphStore({ nodes: over.nodes ?? [node('a')], edges: over.edges ?? [] }),
    nodeStates: over.nodeStates ?? [],
    slots: [],
    moduleLiveness: new Map(),
    now: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock.userNodeState.findUnique.mockResolvedValue(null);
  txMock.userNodeState.upsert.mockImplementation(async (args: { create: object }) => ({
    id: 'ns1',
    ...args.create,
  }));
  txMock.journeyEvent.create.mockImplementation(async (args: { data: object }) => ({
    id: 'e1',
    ...args.data,
  }));
});

describe('enter', () => {
  it('writes the active projection + node_entered event in one transaction', async () => {
    const result = await applyEvent(makeInput({ transition: { kind: 'enter', nodeKey: 'a' } }));

    expect(result.ok).toBe(true);
    expect(executeTransaction).toHaveBeenCalledTimes(1);
    expect(txMock.userNodeState.upsert).toHaveBeenCalledWith({
      where: { journeyId_nodeKey: { journeyId: 'j1', nodeKey: 'a' } },
      create: {
        journeyId: 'j1',
        nodeKey: 'a',
        status: 'active',
        timesCompleted: 0,
        firstEnteredAt: NOW,
        lastActiveAt: NOW,
        completedAt: null,
      },
      update: {
        status: 'active',
        timesCompleted: 0,
        firstEnteredAt: NOW,
        lastActiveAt: NOW,
        completedAt: null,
      },
    });
    const eventData = txMock.journeyEvent.create.mock.calls[0][0].data;
    expect(eventData).toMatchObject({
      userId: 'u1',
      journeyId: 'j1',
      nodeKey: 'a',
      type: ENGINE_EVENT_TYPE.nodeEntered,
      occurredAt: NOW,
    });
  });

  it('preserves an existing firstEnteredAt (re-entering a repeatable node)', async () => {
    const entered = new Date('2026-07-01T00:00:00Z');
    txMock.userNodeState.findUnique.mockResolvedValue({
      timesCompleted: 2,
      firstEnteredAt: entered,
      completedAt: new Date('2026-07-02T00:00:00Z'),
    });
    await applyEvent(
      makeInput({
        transition: { kind: 'enter', nodeKey: 'a' },
        nodes: [node('a', { completionMode: 'repeatable' })],
      })
    );
    expect(txMock.userNodeState.upsert.mock.calls[0][0].update).toMatchObject({
      status: 'active',
      timesCompleted: 2,
      firstEnteredAt: entered,
    });
  });

  it('sets moduleSlug on the event for a module node, and carries the payload', async () => {
    await applyEvent(
      makeInput({
        transition: { kind: 'enter', nodeKey: 'm', payload: { source: 'chat' } },
        nodes: [node('m', { type: 'module', moduleSlug: 'onboarding' })],
      })
    );
    expect(txMock.journeyEvent.create.mock.calls[0][0].data).toMatchObject({
      moduleSlug: 'onboarding',
      payload: { source: 'chat' },
    });
  });

  it('refuses an unavailable node with structured lock reasons and no write', async () => {
    const result = await applyEvent(
      makeInput({
        transition: { kind: 'enter', nodeKey: 'b' },
        nodes: [node('a'), node('b')],
        edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
      })
    );
    expect(result).toEqual({
      ok: false,
      rejection: {
        code: 'not_available',
        message: 'Node "b" is not available to enter.',
        lockReasons: [{ kind: 'prerequisite', from: 'a' }],
      },
    });
    expect(executeTransaction).not.toHaveBeenCalled();
  });

  it('refuses an unknown node with no write', async () => {
    const result = await applyEvent(makeInput({ transition: { kind: 'enter', nodeKey: 'ghost' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.code).toBe('unknown_node');
    expect(executeTransaction).not.toHaveBeenCalled();
  });
});

describe('complete', () => {
  it('closes a once node and increments timesCompleted off the committed row', async () => {
    txMock.userNodeState.findUnique.mockResolvedValue({
      timesCompleted: 0,
      firstEnteredAt: new Date('2026-07-04T00:00:00Z'),
      completedAt: null,
    });
    const result = await applyEvent(
      makeInput({
        transition: { kind: 'complete', nodeKey: 'a' },
        nodeStates: [nstate('a', 'active')],
      })
    );

    expect(result.ok).toBe(true);
    expect(txMock.userNodeState.upsert.mock.calls[0][0].update).toMatchObject({
      status: 'completed',
      timesCompleted: 1,
      completedAt: NOW,
      lastActiveAt: NOW,
    });
    expect(txMock.journeyEvent.create.mock.calls[0][0].data.type).toBe(
      ENGINE_EVENT_TYPE.nodeCompleted
    );
  });

  it('increments a repeatable node from its committed count', async () => {
    txMock.userNodeState.findUnique.mockResolvedValue({
      timesCompleted: 3,
      firstEnteredAt: new Date('2026-07-04T00:00:00Z'),
      completedAt: new Date('2026-07-04T06:00:00Z'),
    });
    await applyEvent(
      makeInput({
        transition: { kind: 'complete', nodeKey: 'a' },
        nodes: [node('a', { completionMode: 'repeatable' })],
        nodeStates: [nstate('a', 'active')],
      })
    );
    expect(txMock.userNodeState.upsert.mock.calls[0][0].update.timesCompleted).toBe(4);
  });

  it('refuses to complete a node that is not active, with no write', async () => {
    const result = await applyEvent(
      makeInput({
        transition: { kind: 'complete', nodeKey: 'a' },
        nodeStates: [nstate('a', 'available')],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.code).toBe('not_active');
    expect(executeTransaction).not.toHaveBeenCalled();
  });
});

/**
 * Availability computation (f-engine t-2) — `computeAvailability`. Pure, so this is
 * a `tests/unit` file with a controlled clock and no DB. Covers the four edge
 * semantics (F3), the three-family conditions via edges (F4), module-liveness
 * intersection (A5), once-close (F6), explainable lock reasons, and validMoves/firsts.
 */

import { describe, it, expect } from 'vitest';
import { inMemoryGraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import {
  computeAvailability,
  type AvailabilityInput,
  type JourneyNodeState,
} from '@/lib/framework/facilitation/engine/availability';
import type { ModuleLiveness } from '@/lib/framework/modules/liveness';
import type {
  MapNode,
  MapEdge,
  EdgeType,
  MapCondition,
} from '@/lib/framework/facilitation/map/schema';

function node(key: string, extra: Partial<MapNode> = {}): MapNode {
  return { key, type: 'milestone', completionMode: 'once', ...extra };
}
function edge(from: string, to: string, type: EdgeType, condition?: MapCondition): MapEdge {
  return { from, to, type, ...(condition ? { condition } : {}) };
}
function nstate(
  nodeKey: string,
  status: string,
  extra: Partial<JourneyNodeState> = {}
): JourneyNodeState {
  return {
    nodeKey,
    status,
    timesCompleted: 0,
    firstEnteredAt: null,
    lastActiveAt: null,
    completedAt: null,
    ...extra,
  };
}

const NOW = new Date('2026-07-05T12:00:00Z');

function run(
  nodes: MapNode[],
  edges: MapEdge[],
  states: JourneyNodeState[] = [],
  opts: Partial<Pick<AvailabilityInput, 'slots' | 'moduleLiveness' | 'now'>> = {}
) {
  return computeAvailability({
    graph: inMemoryGraphStore({ nodes, edges }),
    nodeStates: states,
    slots: opts.slots ?? [],
    moduleLiveness: opts.moduleLiveness ?? (() => undefined),
    now: opts.now ?? NOW,
  });
}

describe('structural edge semantics (F3)', () => {
  it('an entry node with no incoming edges is available', () => {
    const r = run([node('a')], []);
    expect(r.perNode.get('a')?.available).toBe(true);
    expect(r.validMoves).toContain('a');
  });

  it('prerequisite is a hard AND gate; locked until every source is completed', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'c', 'prerequisite'), edge('b', 'c', 'prerequisite')];

    const noneDone = run(nodes, edges);
    expect(noneDone.perNode.get('c')?.available).toBe(false);
    expect(noneDone.perNode.get('c')?.lockReasons).toEqual([
      { kind: 'prerequisite', from: 'a' },
      { kind: 'prerequisite', from: 'b' },
    ]);

    const oneDone = run(nodes, edges, [nstate('a', 'completed')]);
    expect(oneDone.perNode.get('c')?.lockReasons).toEqual([{ kind: 'prerequisite', from: 'b' }]);

    const bothDone = run(nodes, edges, [nstate('a', 'completed'), nstate('b', 'completed')]);
    expect(bothDone.perNode.get('c')?.available).toBe(true);
  });

  it('unlocks is an OR gate; any one satisfied source opens the node', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'c', 'unlocks'), edge('b', 'c', 'unlocks')];

    const none = run(nodes, edges);
    expect(none.perNode.get('c')?.available).toBe(false);
    expect(none.perNode.get('c')?.lockReasons).toEqual([
      { kind: 'unlock', candidates: ['a', 'b'] },
    ]);

    const one = run(nodes, edges, [nstate('a', 'completed')]);
    expect(one.perNode.get('c')?.available).toBe(true);
  });

  it('tangent is an always-open side path that bypasses the prerequisite gate', () => {
    const nodes = [node('p'), node('t'), node('n')];
    const edges = [edge('p', 'n', 'prerequisite'), edge('t', 'n', 'tangent')];

    // p not completed and t not reached ⇒ locked on the prerequisite.
    const gated = run(nodes, edges);
    expect(gated.perNode.get('n')?.available).toBe(false);
    expect(gated.perNode.get('n')?.lockReasons).toEqual([{ kind: 'prerequisite', from: 'p' }]);

    // t merely reached (visited, not completed) ⇒ the tangent opens n despite p.
    const viaTangent = run(nodes, edges, [nstate('t', 'visited')]);
    expect(viaTangent.perNode.get('n')?.available).toBe(true);
  });

  it('related_to never gates eligibility', () => {
    const r = run([node('a'), node('r')], [edge('a', 'r', 'related_to')]);
    expect(r.perNode.get('r')?.available).toBe(true);
  });
});

describe('edge conditions (F4)', () => {
  it('a satisfied prerequisite still locks while its temporal gate is closed', () => {
    const future: MapCondition = {
      family: 'temporal',
      kind: 'available_after',
      at: '2026-07-10T00:00:00Z',
    };
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b', 'prerequisite', future)];
    const states = [nstate('a', 'completed')];

    const early = run(nodes, edges, states, { now: NOW });
    expect(early.perNode.get('b')?.available).toBe(false);
    expect(early.perNode.get('b')?.lockReasons).toEqual([
      { kind: 'condition', from: 'a', edgeType: 'prerequisite', condition: future },
    ]);

    const later = run(nodes, edges, states, { now: new Date('2026-07-11T00:00:00Z') });
    expect(later.perNode.get('b')?.available).toBe(true);
  });
});

describe('module liveness intersection (A5)', () => {
  const moduleNode = node('m', { type: 'module', moduleSlug: 'mod' });

  it('locks a journey-open node whose module is not live', () => {
    const dead: ModuleLiveness = { live: false, reason: 'flag' };
    const r = run([moduleNode], [], [], { moduleLiveness: () => dead });
    expect(r.perNode.get('m')?.available).toBe(false);
    expect(r.perNode.get('m')?.lockReasons).toEqual([
      { kind: 'module', moduleSlug: 'mod', reason: 'flag' },
    ]);
  });

  it('leaves it open when the module is live (or unknown to the lookup)', () => {
    expect(
      run([moduleNode], [], [], { moduleLiveness: () => ({ live: true }) }).perNode.get('m')
        ?.available
    ).toBe(true);
    expect(
      run([moduleNode], [], [], { moduleLiveness: () => undefined }).perNode.get('m')?.available
    ).toBe(true);
  });
});

describe('completion semantics (F6)', () => {
  it('a completed once node is closed', () => {
    const r = run([node('a', { completionMode: 'once' })], [], [nstate('a', 'completed')]);
    expect(r.perNode.get('a')?.available).toBe(false);
    expect(r.perNode.get('a')?.lockReasons).toEqual([{ kind: 'completed' }]);
    expect(r.validMoves).not.toContain('a');
  });

  it('a completed repeatable node reopens', () => {
    const r = run([node('a', { completionMode: 'repeatable' })], [], [nstate('a', 'completed')]);
    expect(r.perNode.get('a')?.available).toBe(true);
    expect(r.validMoves).toContain('a');
  });
});

describe('explainability — every failing gate is listed', () => {
  it('reports both a dead module and an unmet prerequisite', () => {
    const nodes = [node('p'), node('m', { type: 'module', moduleSlug: 'mod' })];
    const edges = [edge('p', 'm', 'prerequisite')];
    const dead: ModuleLiveness = { live: false, reason: 'status' };
    const r = run(nodes, edges, [], { moduleLiveness: () => dead });
    expect(r.perNode.get('m')?.lockReasons).toEqual([
      { kind: 'module', moduleSlug: 'mod', reason: 'status' },
      { kind: 'prerequisite', from: 'p' },
    ]);
  });
});

describe('validMoves and firsts', () => {
  it('validMoves is exactly the available set', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b', 'prerequisite')];
    const r = run(nodes, edges);
    expect(r.validMoves).toEqual(['a']); // b is gated on a
  });

  it('firsts are available onFirstArrival nodes the user has never reached', () => {
    const nodes = [
      node('welcome', { onFirstArrival: { workflowSlug: 'w' } }),
      node('seen', { onFirstArrival: { agentSlug: 'ag' } }),
      node('plain'),
    ];
    // 'seen' already has a first-entry timestamp; 'plain' has no arrival hook.
    const states = [nstate('seen', 'active', { firstEnteredAt: new Date('2026-07-01T00:00:00Z') })];
    const r = run(nodes, [], states);
    expect(r.firsts).toEqual(['welcome']);
  });
});

/**
 * Unit tests: module-completion detection (f-engagement-analytics t-3). Prisma and the
 * engagement emit are mocked; asserts `module.completed` fires exactly once, when every
 * `module`-type node for the slug has been completed by the user — derived from the
 * `node_completed` event stream (A9), guarded idempotent by a prior `module.completed`,
 * and never thrown out of (best-effort instrumentation).
 *
 * @see lib/framework/engagement/module-completion.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { findFirstMock, findManyMock, recordMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  findManyMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    journeyEvent: { findFirst: findFirstMock, findMany: findManyMock },
  },
}));
vi.mock('@/lib/framework/engagement/record-engagement', () => ({
  recordModuleEngagement: recordMock,
}));

import { maybeEmitModuleCompleted } from '@/lib/framework/engagement/module-completion';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';

/** A minimal graph node — the checker only reads `type` / `moduleSlug` / `key`. */
type FakeNode = { key: string; type: string; moduleSlug?: string };

/** A stub GraphStore whose only exercised method is `nodes()`. */
function graphWith(nodes: FakeNode[]): GraphStore {
  return { nodes: () => nodes } as unknown as GraphStore;
}

/** Standard two-node module ("intro" + "deep") plus an unrelated node of another module. */
const GRAPH = graphWith([
  { key: 'intro', type: 'module', moduleSlug: 'onboarding' },
  { key: 'deep', type: 'module', moduleSlug: 'onboarding' },
  { key: 'stage-1', type: 'stage' },
  { key: 'other', type: 'module', moduleSlug: 'billing' },
]);

/** node_completed rows (distinct nodeKey) the user has for the module's nodes. */
const completed = (...nodeKeys: string[]) => nodeKeys.map((nodeKey) => ({ nodeKey }));

const INPUT = { userId: 'u1', moduleSlug: 'onboarding', journeyId: 'j1', graph: GRAPH };

beforeEach(() => {
  vi.clearAllMocks();
  findFirstMock.mockResolvedValue(null); // no prior module.completed by default
  recordMock.mockResolvedValue(undefined);
});

describe('maybeEmitModuleCompleted', () => {
  it('emits module.completed when every module node is completed', async () => {
    findManyMock.mockResolvedValue(completed('intro', 'deep'));

    await maybeEmitModuleCompleted(INPUT);

    expect(recordMock).toHaveBeenCalledWith({
      userId: 'u1',
      moduleSlug: 'onboarding',
      type: 'module.completed',
      journeyId: 'j1',
    });
  });

  it('does NOT emit when only some of the module nodes are completed', async () => {
    findManyMock.mockResolvedValue(completed('intro')); // "deep" still outstanding

    await maybeEmitModuleCompleted(INPUT);

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('is idempotent — a prior module.completed short-circuits before the completion read', async () => {
    findFirstMock.mockResolvedValue({ id: 'evt-earlier' });

    await maybeEmitModuleCompleted(INPUT);

    expect(findManyMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('reads completion from THIS module’s nodes only (scopes the event query by nodeKey set)', async () => {
    findManyMock.mockResolvedValue(completed('intro', 'deep'));

    await maybeEmitModuleCompleted(INPUT);

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journeyId: 'j1',
          userId: 'u1',
          type: 'node_completed',
          nodeKey: { in: ['intro', 'deep'] },
        }),
        distinct: ['nodeKey'],
      })
    );
  });

  it('is a clean no-op when the slug has no module nodes (no queries, no emit)', async () => {
    await maybeEmitModuleCompleted({ ...INPUT, moduleSlug: 'unknown' });

    expect(findFirstMock).not.toHaveBeenCalled();
    expect(findManyMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('swallows a DB failure — never throws out of the transition caller', async () => {
    findFirstMock.mockRejectedValue(new Error('db down'));

    await expect(maybeEmitModuleCompleted(INPUT)).resolves.toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });
});

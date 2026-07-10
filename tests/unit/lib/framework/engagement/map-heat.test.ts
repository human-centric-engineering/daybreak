/**
 * Unit tests: collective map heat / drop-off (f-engagement-analytics t-1). Prisma is
 * mocked; asserts each per-node figure is derived from the stream — event volume
 * (entries/completions) vs distinct-user counts (distinctUsers/enteredUsers/
 * completedUsers), drop-off as entered-minus-completed distinct users (clamped), the
 * empty-map short-circuit (no journeys ⇒ no event query), the subject-scope `userId`
 * filter threading into the journey WHERE, and a stable nodeKey ordering.
 *
 * @see lib/framework/engagement/map-heat.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { journeyFindMock, groupByMock } = vi.hoisted(() => ({
  journeyFindMock: vi.fn(),
  groupByMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    userJourney: { findMany: journeyFindMock },
    journeyEvent: { groupBy: groupByMock },
  },
}));

import { getMapHeat } from '@/lib/framework/engagement/map-heat';

const ENTERED = 'node_entered';
const COMPLETED = 'node_completed';

/** One groupBy row: a distinct user for a (node, type) with their event count. */
const row = (nodeKey: string | null, type: string, userId: string, count: number) => ({
  nodeKey,
  type,
  userId,
  _count: { _all: count },
});

beforeEach(() => {
  vi.clearAllMocks();
  journeyFindMock.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }]);
  groupByMock.mockResolvedValue([]);
});

describe('getMapHeat', () => {
  it('folds event volume and distinct-user counts per node, deriving drop-off', async () => {
    // node "intro": u1 enters twice + completes; u2 enters once, never completes.
    // node "deep":  u1 enters once, never completes.
    groupByMock.mockResolvedValue([
      row('intro', ENTERED, 'u1', 2),
      row('intro', COMPLETED, 'u1', 1),
      row('intro', ENTERED, 'u2', 1),
      row('deep', ENTERED, 'u1', 1),
    ]);

    const heat = await getMapHeat('onboarding');

    expect(heat.graphSlug).toBe('onboarding');
    const intro = heat.nodes.find((n) => n.nodeKey === 'intro')!;
    expect(intro.entries).toBe(3); // event volume: 2 (u1) + 1 (u2)
    expect(intro.completions).toBe(1); // event volume
    expect(intro.distinctUsers).toBe(2); // u1, u2
    expect(intro.enteredUsers).toBe(2); // u1, u2
    expect(intro.completedUsers).toBe(1); // u1
    expect(intro.dropOff).toBe(1); // 2 entered − 1 completed

    const deep = heat.nodes.find((n) => n.nodeKey === 'deep')!;
    expect(deep.entries).toBe(1);
    expect(deep.completions).toBe(0);
    expect(deep.dropOff).toBe(1); // 1 entered − 0 completed
  });

  it('clamps drop-off at zero when completions somehow exceed distinct entrants', async () => {
    // A completed-without-a-recorded-enter row (e.g. an entry pre-dating instrumentation)
    // must not produce a negative drop-off.
    groupByMock.mockResolvedValue([row('intro', COMPLETED, 'u9', 1)]);
    const heat = await getMapHeat('onboarding');
    const intro = heat.nodes.find((n) => n.nodeKey === 'intro')!;
    expect(intro.enteredUsers).toBe(0);
    expect(intro.completedUsers).toBe(1);
    expect(intro.dropOff).toBe(0);
  });

  it('short-circuits to empty heat when the map has no journeys (no event query)', async () => {
    journeyFindMock.mockResolvedValue([]);
    const heat = await getMapHeat('empty-map');
    expect(heat).toEqual({ graphSlug: 'empty-map', nodes: [] });
    expect(groupByMock).not.toHaveBeenCalled();
  });

  it('scopes the event query to the map’s journey ids', async () => {
    journeyFindMock.mockResolvedValue([{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }]);
    await getMapHeat('onboarding');
    expect(groupByMock).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['nodeKey', 'type', 'userId'],
        where: expect.objectContaining({ journeyId: { in: ['j1', 'j2', 'j3'] } }),
      })
    );
  });

  it('threads the subject-scope userId filter into the journey lookup', async () => {
    await getMapHeat('onboarding', { userId: 'u1' });
    expect(journeyFindMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { graphSlug: 'onboarding', userId: 'u1' } })
    );
  });

  it('omits the userId filter when unscoped (cross-user default)', async () => {
    await getMapHeat('onboarding');
    expect(journeyFindMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { graphSlug: 'onboarding' } })
    );
  });

  it('returns nodes ordered by nodeKey for a deterministic payload', async () => {
    groupByMock.mockResolvedValue([
      row('zeta', ENTERED, 'u1', 1),
      row('alpha', ENTERED, 'u1', 1),
      row('mid', ENTERED, 'u1', 1),
    ]);
    const heat = await getMapHeat('onboarding');
    expect(heat.nodes.map((n) => n.nodeKey)).toEqual(['alpha', 'mid', 'zeta']);
  });
});

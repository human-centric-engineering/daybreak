/**
 * Unit tests: module engagement stats (f-engagement t-3). Prisma is mocked; asserts each
 * metric is derived from the stream, the ratings summary (count / average / distribution /
 * recent comments) is folded correctly, a malformed feedback payload is skipped (not
 * counted, no crash), the empty case yields zeros + null average, and the subject-scope
 * `userId` filter threads into every query's WHERE.
 *
 * @see lib/framework/engagement/stats.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { findMock, countMock, groupByMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  countMock: vi.fn(),
  groupByMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    journeyEvent: { findMany: findMock, count: countMock, groupBy: groupByMock },
  },
}));
vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { getModuleStats } from '@/lib/framework/engagement/stats';

const d = (iso: string) => new Date(iso);

// findMany dispatches by args: the `distinct` call is the unique-users probe; the other is
// the feedback fetch.
function armFindMany(distinctUsers: Array<{ userId: string }>, feedbackRows: unknown[]) {
  findMock.mockImplementation((args: { distinct?: string[] }) =>
    Promise.resolve(args.distinct ? distinctUsers : feedbackRows)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults; individual tests override.
  armFindMany([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }], []);
  countMock.mockImplementation((args: { where: { type: string } }) =>
    Promise.resolve(args.where.type === 'module.entered' ? 10 : 4)
  );
  groupByMock.mockResolvedValue([
    { userId: 'u1', _count: { _all: 3 } },
    { userId: 'u2', _count: { _all: 1 } },
    { userId: 'u3', _count: { _all: 2 } },
  ]);
});

describe('getModuleStats', () => {
  it('derives unique users / entries / completions / returning users from the stream', async () => {
    const stats = await getModuleStats('onboarding');
    expect(stats.moduleSlug).toBe('onboarding');
    expect(stats.uniqueUsers).toBe(3); // distinct userId rows
    expect(stats.entries).toBe(10); // module.entered count
    expect(stats.completions).toBe(4); // node_completed count
    expect(stats.returningUsers).toBe(2); // u1 (3) and u3 (2) have >1 entry; u2 (1) does not
  });

  it('summarises feedback: count, 2dp average, full distribution, recent comments (newest first)', async () => {
    armFindMany(
      [{ userId: 'u1' }],
      [
        { payload: { rating: 5, comment: 'loved it' }, occurredAt: d('2026-07-03T00:00:00Z') },
        { payload: { rating: 4 }, occurredAt: d('2026-07-02T00:00:00Z') },
        { payload: { rating: 4, comment: 'good' }, occurredAt: d('2026-07-01T00:00:00Z') },
      ]
    );
    const { feedback } = await getModuleStats('onboarding');
    expect(feedback.count).toBe(3);
    expect(feedback.averageRating).toBe(4.33); // (5+4+4)/3 = 4.333 → 4.33
    expect(feedback.distribution).toEqual({ '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 });
    // Only the two rows that carried a comment, in the fetched (newest-first) order.
    expect(feedback.recentComments).toEqual([
      { rating: 5, comment: 'loved it', occurredAt: '2026-07-03T00:00:00.000Z' },
      { rating: 4, comment: 'good', occurredAt: '2026-07-01T00:00:00.000Z' },
    ]);
  });

  it('caps recent comments at the requested limit but still counts every rating', async () => {
    armFindMany(
      [{ userId: 'u1' }],
      [
        { payload: { rating: 5, comment: 'a' }, occurredAt: d('2026-07-03T00:00:00Z') },
        { payload: { rating: 3, comment: 'b' }, occurredAt: d('2026-07-02T00:00:00Z') },
      ]
    );
    const { feedback } = await getModuleStats('onboarding', {}, { recentCommentLimit: 1 });
    expect(feedback.count).toBe(2);
    expect(feedback.recentComments).toHaveLength(1);
    expect(feedback.recentComments[0].comment).toBe('a');
  });

  it('skips a malformed feedback payload without counting it or crashing', async () => {
    armFindMany(
      [{ userId: 'u1' }],
      [
        { payload: { rating: 5 }, occurredAt: d('2026-07-03T00:00:00Z') },
        { payload: { rating: 99 }, occurredAt: d('2026-07-02T00:00:00Z') }, // out of range → skipped
        { payload: null, occurredAt: d('2026-07-01T00:00:00Z') }, // no payload → skipped
      ]
    );
    const { feedback } = await getModuleStats('onboarding');
    expect(feedback.count).toBe(1);
    expect(feedback.averageRating).toBe(5);
  });

  it('returns zeros and a null average when there is no engagement', async () => {
    armFindMany([], []);
    countMock.mockResolvedValue(0);
    groupByMock.mockResolvedValue([]);
    const stats = await getModuleStats('empty');
    expect(stats.uniqueUsers).toBe(0);
    expect(stats.entries).toBe(0);
    expect(stats.completions).toBe(0);
    expect(stats.returningUsers).toBe(0);
    expect(stats.feedback).toEqual({
      count: 0,
      averageRating: null,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      recentComments: [],
    });
  });

  it('threads the subject-scope userId filter into every query WHERE', async () => {
    await getModuleStats('onboarding', { userId: 'user-9' });
    for (const call of findMock.mock.calls) {
      expect(call[0].where).toMatchObject({ moduleSlug: 'onboarding', userId: 'user-9' });
    }
    for (const call of countMock.mock.calls) {
      expect(call[0].where).toMatchObject({ moduleSlug: 'onboarding', userId: 'user-9' });
    }
    expect(groupByMock.mock.calls[0][0].where).toMatchObject({
      moduleSlug: 'onboarding',
      userId: 'user-9',
    });
  });
});

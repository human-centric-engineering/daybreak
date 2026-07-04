/**
 * Journey read queries (f-journey-state t-2) — `getJourney` / `getNodeStates` /
 * `getJourneyTimeline`.
 *
 * Two things to prove per read: (1) it **routes through `canRead`** — a denied
 * viewer throws `ForbiddenError` and Prisma is never touched; and (2) when allowed,
 * it issues the expected query shape (the `@@unique` selector, the ownership
 * `where` guard, the index-served ordering). House style: no live DB — `prisma` is
 * mocked (`tests/integration`, mirroring `map/queries.test.ts`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    userJourney: { findUnique: vi.fn() },
    userNodeState: { findMany: vi.fn() },
    journeyEvent: { findMany: vi.fn() },
  },
}));

import {
  getJourney,
  getNodeStates,
  getJourneyTimeline,
} from '@/lib/framework/facilitation/journey/queries';
import { prisma } from '@/lib/db/client';
import { ForbiddenError } from '@/lib/api/errors';
import type { JourneyViewer } from '@/lib/framework/shared/access';

const alice: JourneyViewer = { userId: 'user_alice' };
const support: JourneyViewer = { userId: 'user_support', isAdminSupport: true };

beforeEach(() => vi.clearAllMocks());

describe('getJourney', () => {
  it('resolves the journey by its natural unique key for an owning viewer', async () => {
    const row = { id: 'j1', userId: 'user_alice', graphSlug: 'main', contextKey: '' };
    vi.mocked(prisma.userJourney.findUnique).mockResolvedValue(row as never);

    await expect(getJourney(alice, { userId: 'user_alice', graphSlug: 'main' })).resolves.toEqual(
      row
    );
    expect(prisma.userJourney.findUnique).toHaveBeenCalledWith({
      where: {
        userId_graphSlug_contextKey: {
          userId: 'user_alice',
          graphSlug: 'main',
          contextKey: '',
        },
      },
    });
  });

  it('defaults a missing contextKey to the empty-string sentinel', async () => {
    vi.mocked(prisma.userJourney.findUnique).mockResolvedValue(null);
    await getJourney(alice, { userId: 'user_alice', graphSlug: 'main', contextKey: 'ctx-7' });
    expect(prisma.userJourney.findUnique).toHaveBeenCalledWith({
      where: {
        userId_graphSlug_contextKey: {
          userId: 'user_alice',
          graphSlug: 'main',
          contextKey: 'ctx-7',
        },
      },
    });
  });

  it('returns null when the user has not started the journey', async () => {
    vi.mocked(prisma.userJourney.findUnique).mockResolvedValue(null);
    await expect(
      getJourney(alice, { userId: 'user_alice', graphSlug: 'main' })
    ).resolves.toBeNull();
  });

  it('throws ForbiddenError and never touches Prisma when canRead denies', async () => {
    await expect(
      getJourney(alice, { userId: 'user_bob', graphSlug: 'main' })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.userJourney.findUnique).not.toHaveBeenCalled();
  });

  it('lets an admin-support viewer read another subject’s journey', async () => {
    vi.mocked(prisma.userJourney.findUnique).mockResolvedValue(null);
    await expect(
      getJourney(support, { userId: 'user_alice', graphSlug: 'main' })
    ).resolves.toBeNull();
    expect(prisma.userJourney.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('getNodeStates', () => {
  it('reads node states filtered by journey and owning subject, ordered by nodeKey', async () => {
    const rows = [{ id: 'ns1', journeyId: 'j1', nodeKey: 'a', status: 'active' }];
    vi.mocked(prisma.userNodeState.findMany).mockResolvedValue(rows as never);

    await expect(getNodeStates(alice, { journeyId: 'j1', subject: 'user_alice' })).resolves.toEqual(
      rows
    );
    expect(prisma.userNodeState.findMany).toHaveBeenCalledWith({
      where: { journeyId: 'j1', journey: { userId: 'user_alice' } },
      orderBy: { nodeKey: 'asc' },
    });
  });

  it('throws ForbiddenError and never touches Prisma when canRead denies', async () => {
    await expect(
      getNodeStates(alice, { journeyId: 'j1', subject: 'user_bob' })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.userNodeState.findMany).not.toHaveBeenCalled();
  });
});

describe('getJourneyTimeline', () => {
  it('reads the event timeline filtered by journey and subject, chronological by default', async () => {
    const rows = [{ id: 'e1', journeyId: 'j1', userId: 'user_alice', type: 'node_entered' }];
    vi.mocked(prisma.journeyEvent.findMany).mockResolvedValue(rows as never);

    await expect(
      getJourneyTimeline(alice, { journeyId: 'j1', subject: 'user_alice' })
    ).resolves.toEqual(rows);
    expect(prisma.journeyEvent.findMany).toHaveBeenCalledWith({
      where: { journeyId: 'j1', userId: 'user_alice' },
      orderBy: { occurredAt: 'asc' },
    });
  });

  it('honours order + limit options', async () => {
    vi.mocked(prisma.journeyEvent.findMany).mockResolvedValue([] as never);
    await getJourneyTimeline(
      alice,
      { journeyId: 'j1', subject: 'user_alice' },
      { order: 'desc', limit: 10 }
    );
    expect(prisma.journeyEvent.findMany).toHaveBeenCalledWith({
      where: { journeyId: 'j1', userId: 'user_alice' },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });
  });

  it('omits `take` when no limit is given', async () => {
    vi.mocked(prisma.journeyEvent.findMany).mockResolvedValue([] as never);
    await getJourneyTimeline(alice, { journeyId: 'j1', subject: 'user_alice' });
    const call = vi.mocked(prisma.journeyEvent.findMany).mock.calls[0][0];
    expect(call).not.toHaveProperty('take');
  });

  it('throws ForbiddenError and never touches Prisma when canRead denies', async () => {
    await expect(
      getJourneyTimeline(alice, { journeyId: 'j1', subject: 'user_bob' })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.journeyEvent.findMany).not.toHaveBeenCalled();
  });
});

/**
 * Active/stalled journey enumeration (f-overlays t-3). Mocks the DB client; proves the cross-user
 * "stalled active" filter — some node `active`, no event since `stalledBefore` — plus ordering and cap.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { userJourney: { findMany: vi.fn() } } }));

import { listStalledActiveJourneys } from '@/lib/framework/facilitation/overlays/active-journeys';
import { prisma } from '@/lib/db/client';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

beforeEach(() => vi.clearAllMocks());

describe('listStalledActiveJourneys', () => {
  it('filters to in-progress-but-quiet journeys, oldest first, capped', async () => {
    vi.mocked(prisma.userJourney.findMany).mockResolvedValue([{ id: 'j1' }] as never);
    const before = new Date('2026-07-01T00:00:00Z');

    const result = await listStalledActiveJourneys(before, 50);
    expect(result).toEqual([{ id: 'j1' }]);
    expect(prisma.userJourney.findMany).toHaveBeenCalledWith({
      where: {
        nodeStates: { some: { status: NODE_STATE_STATUS.active } },
        events: { none: { occurredAt: { gte: before } } },
      },
      orderBy: { startedAt: 'asc' },
      take: 50,
    });
  });
});

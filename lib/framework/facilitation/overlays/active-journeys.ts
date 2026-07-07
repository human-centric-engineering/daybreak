/**
 * Active/stalled journey enumeration (f-overlays t-3, spec §5.4, F13) — the system-scoped read the
 * proactive sweep iterates. The shipped journey queries are all per-subject and `canRead`-guarded (X2);
 * proactive guidance needs the opposite — a cross-user enumerator that a background sweep runs, then
 * loads each journey's guidance under that journey's OWN (self) viewer so `canRead` still holds per row.
 *
 * "Stalled active" = a journey the user is mid-way through (≥1 node currently `active`) with no journey
 * event since `stalledBefore` — i.e. in progress but gone quiet. There is no `active`/`lastActivity`
 * column on `UserJourney`, so both halves are derived via relation filters over the projection
 * (`UserNodeState.status`) and the event log (`JourneyEvent.occurredAt`).
 */

import type { UserJourney } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

/**
 * Journeys that are in progress (some node `active`) but have had no event since `stalledBefore`,
 * oldest-started first, capped at `limit`. Cross-user by design — the sole system-scoped journey read;
 * the caller re-applies per-journey access by loading guidance under each journey's own viewer.
 */
export async function listStalledActiveJourneys(
  stalledBefore: Date,
  limit: number
): Promise<UserJourney[]> {
  return prisma.userJourney.findMany({
    where: {
      nodeStates: { some: { status: NODE_STATE_STATUS.active } },
      events: { none: { occurredAt: { gte: stalledBefore } } },
    },
    orderBy: { startedAt: 'asc' },
    take: limit,
  });
}

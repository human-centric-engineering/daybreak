/**
 * `resolveJourneyNow` (f-engine t-2) — the timezone-resolving seam that produces the
 * `now` the pure availability engine takes (spec §C7, decision 6).
 *
 * Temporal gates (F4) evaluate `now` — "against whose timezone?" A deadline for a
 * user abroad needs per-user resolution, so this seam reads the journey user's
 * `User.timezone` (IANA, `String? @default("UTC")` — the one timezone column in the
 * tree) and hands back both the resolved instant and that zone. `computeAvailability`
 * itself stays a pure `now`-taker; today's shipped temporal conditions compare
 * absolute (zoned-ISO) instants, so only the instant is consulted — the `timeZone`
 * is carried for the local-time-relative predicates §C7 anticipates.
 *
 * This is the deliberately-impure half (a DB read + a clock read), kept out of the
 * pure `availability.ts` / `conditions.ts` cores (the `applyEvent`-is-the-writer,
 * `computeAvailability`-is-pure split): the engine never reads a clock or the DB.
 */

import { prisma } from '@/lib/db/client';

/** The resolved reference point for a journey's temporal evaluation. */
export interface ResolvedNow {
  /** The instant the pure engine compares against (`computeAvailability`'s `now`). */
  instant: Date;
  /** The journey user's IANA timezone (`UTC` when unset) — carried for future
   *  local-time-relative predicates; not consulted by today's absolute-instant gates. */
  timeZone: string;
}

/**
 * Resolve the `now` for `userId`'s journey. `at` overrides the instant (the dry-run
 * simulator sets the clock, F18); omitted ⇒ the current time. Falls back to `UTC`
 * when the user has no timezone (the column already defaults `"UTC"`, so this only
 * bites if the row is somehow null or the user is absent).
 */
export async function resolveJourneyNow(userId: string, at?: Date): Promise<ResolvedNow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return {
    instant: at ?? new Date(),
    timeZone: user?.timezone ?? 'UTC',
  };
}

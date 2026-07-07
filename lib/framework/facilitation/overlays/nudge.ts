/**
 * Proactive-guidance nudge delivery (f-overlays t-3b, spec §5.4, F13) — the send half. Runs the
 * (t-3a) sweep, drops journeys nudged within the throttle window, emails the remaining owners a
 * "next step is waiting" nudge, and records each send so a later sweep won't re-nudge them.
 *
 * Reuses Sunrise-core email (`sendEmail`); the copy is deterministic (guidance is LLM-free). Nudges go
 * to the JOURNEY OWNER (there is no in-app notification store — email or outbound webhook are the only
 * channels; email is the v1 choice). The throttle table (`framework_journey_nudge`) is the idempotency
 * mechanism: a 60-second scheduler tick re-running the sweep won't re-send, because a just-nudged
 * journey is filtered out. Delivery is ONE email per user per sweep (see below); per-user failures are
 * isolated (logged, counted) so one bad send doesn't abort the batch; a non-sent result is NOT
 * throttled, so it is retried next sweep.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { BRAND } from '@/lib/brand';
import { getBaseUrl } from '@/lib/api/server-fetch';
import { sendEmail } from '@/lib/email/send';
import ProactiveNudgeEmail from '@/emails/proactive-nudge';
import { listRecentlyNudgedJourneyIds } from '@/lib/framework/facilitation/overlays/queries';
import {
  runProactiveGuidanceSweep,
  stalledBeforeFromDays,
  DEFAULT_STALLED_DAYS,
  DEFAULT_MAX_JOURNEYS,
  type NudgeCandidate,
} from '@/lib/framework/facilitation/overlays/proactive-sweep';

/** Don't re-nudge a journey nudged within this many days. Documented default, tunable. */
export const DEFAULT_THROTTLE_DAYS = 7;

export interface DeliverNudgesArgs {
  stalledDays?: number;
  maxJourneys?: number;
  throttleDays?: number;
  /** Injectable clock for deterministic tests; defaults to now. */
  now?: Date;
}

export interface DeliverNudgesResult {
  /** Stalled active journeys examined by the sweep. */
  scanned: number;
  /** Nudge-worthy candidate journeys the sweep produced. */
  candidates: number;
  /** Candidate journeys skipped because they were nudged within the throttle window. */
  throttled: number;
  /** Emails sent — at most ONE per user per sweep (the nudge is generic, so a multi-journey user
   *  gets one, not duplicates). */
  emailsSent: number;
  /** Throttle rows written — every fresh journey of an emailed user, so none re-fire this window. */
  journeysNudged: number;
  /** Users skipped because the owner has no email address (or was erased between sweep and send). */
  noEmail: number;
  /** Users whose send failed / was disabled (NOT throttled — retried next sweep). */
  failed: number;
}

/**
 * Run the sweep and deliver throttled nudges. Returns a per-outcome summary. Never throws on a single
 * send — failures are counted, not fatal.
 *
 * Delivery collapses to ONE email per user per sweep: the nudge copy is generic (it names no journey),
 * so a user with several stalled journeys must not receive identical duplicates. On a successful send
 * every one of that user's fresh journeys is throttled, so none re-fire until the window passes. Order
 * is send-then-record (at-least-once): a rare post-send throttle-write failure risks one re-nudge next
 * sweep — preferred over record-then-send, which would risk a silent drop. Concurrent sweeps of the
 * SAME schedule are prevented upstream by the scheduler's per-schedule claim.
 */
export async function deliverProactiveNudges(
  args: DeliverNudgesArgs = {}
): Promise<DeliverNudgesResult> {
  const now = args.now ?? new Date();
  const stalledDays = args.stalledDays ?? DEFAULT_STALLED_DAYS;
  const maxJourneys = args.maxJourneys ?? DEFAULT_MAX_JOURNEYS;
  const throttleDays = args.throttleDays ?? DEFAULT_THROTTLE_DAYS;

  const { scanned, candidates } = await runProactiveGuidanceSweep({
    stalledBefore: stalledBeforeFromDays(stalledDays, now),
    maxJourneys,
  });
  if (candidates.length === 0) {
    return {
      scanned,
      candidates: 0,
      throttled: 0,
      emailsSent: 0,
      journeysNudged: 0,
      noEmail: 0,
      failed: 0,
    };
  }

  // Throttle: drop journeys nudged within the window (one query over the candidate set). The cutoff is
  // `now - throttleDays` — `stalledBeforeFromDays` is just "days before now", reused here for the
  // throttle window (not the stalled window).
  const throttleCutoff = stalledBeforeFromDays(throttleDays, now);
  const throttledIds = await listRecentlyNudgedJourneyIds(
    candidates.map((c) => c.journeyId),
    throttleCutoff
  );
  const fresh = candidates.filter((c) => !throttledIds.has(c.journeyId));

  // Collapse to one nudge per user: group the fresh journeys by owner.
  const journeysByUser = new Map<string, NudgeCandidate[]>();
  for (const candidate of fresh) {
    const list = journeysByUser.get(candidate.userId);
    if (list) list.push(candidate);
    else journeysByUser.set(candidate.userId, [candidate]);
  }

  // Resolve owner emails in one query.
  const users = await prisma.user.findMany({
    where: { id: { in: [...journeysByUser.keys()] } },
    select: { id: true, email: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const baseUrl = getBaseUrl();
  const subject = `A next step is waiting in ${BRAND.name}`;
  let emailsSent = 0;
  let journeysNudged = 0;
  let noEmail = 0;
  let failed = 0;

  for (const [userId, journeys] of journeysByUser) {
    const user = byId.get(userId);
    if (!user?.email) {
      // Owner has no address, or was erased between the sweep and this lookup — nothing to send.
      noEmail += 1;
      continue;
    }

    let result;
    try {
      result = await sendEmail({
        to: user.email,
        subject,
        react: ProactiveNudgeEmail({ userName: user.name ?? 'there', baseUrl }),
      });
    } catch (err) {
      logger.warn('Proactive nudge send failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
      continue;
    }
    if (result.status !== 'sent') {
      // 'failed' or 'disabled' — do NOT record throttle, so it's retried on the next sweep.
      failed += 1;
      continue;
    }
    emailsSent += 1;

    // Record ALL of this user's fresh journeys so none re-fire this window. Best-effort: the email is
    // already out, so a throttle-write failure only risks a rare re-nudge — never fail the send for it.
    for (const journey of journeys) {
      try {
        await prisma.frameworkJourneyNudge.upsert({
          where: { journeyId: journey.journeyId },
          create: {
            userId,
            journeyId: journey.journeyId,
            nodeKey: journey.nodeKey,
            nudgedAt: now,
          },
          update: { userId, nodeKey: journey.nodeKey, nudgedAt: now },
        });
        journeysNudged += 1;
      } catch (err) {
        logger.warn('Proactive nudge throttle-record failed (send already delivered)', {
          journeyId: journey.journeyId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    scanned,
    candidates: candidates.length,
    throttled: candidates.length - fresh.length,
    emailsSent,
    journeysNudged,
    noEmail,
    failed,
  };
}

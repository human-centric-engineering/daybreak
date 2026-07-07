/**
 * Proactive-guidance nudge delivery (f-overlays t-3b, spec §5.4, F13) — the send half. Runs the
 * (t-3a) sweep, drops journeys nudged within the throttle window, emails the remaining owners a
 * "next step is waiting" nudge, and records each send so a later sweep won't re-nudge them.
 *
 * Reuses Sunrise-core email (`sendEmail`); the copy is deterministic (guidance is LLM-free). Nudges go
 * to the JOURNEY OWNER (there is no in-app notification store — email or outbound webhook are the only
 * channels; email is the v1 choice). The throttle table (`framework_journey_nudge`) is the idempotency
 * mechanism: a 60-second scheduler tick re-running the sweep won't re-send, because a just-nudged
 * journey is filtered out. Per-journey failures are isolated (logged, counted) so one bad send doesn't
 * abort the batch; a non-sent result is NOT throttled, so it is retried next sweep.
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
  /** Nudge-worthy candidates the sweep produced. */
  candidates: number;
  /** Candidates skipped because they were nudged within the throttle window. */
  throttled: number;
  /** Nudges emailed + recorded. */
  sent: number;
  /** Candidates skipped because the owner has no email address. */
  noEmail: number;
  /** Sends that failed / were disabled (NOT throttled — retried next sweep). */
  failed: number;
}

/**
 * Run the sweep and deliver throttled nudges. Returns a per-outcome summary. Never throws on a single
 * send — failures are counted, not fatal.
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
    return { scanned, candidates: 0, throttled: 0, sent: 0, noEmail: 0, failed: 0 };
  }

  // Throttle: drop journeys nudged within the window (one query over the candidate set).
  const throttledIds = await listRecentlyNudgedJourneyIds(
    candidates.map((c) => c.journeyId),
    stalledBeforeFromDays(throttleDays, now)
  );
  const fresh = candidates.filter((c) => !throttledIds.has(c.journeyId));

  // Resolve owner emails in one query.
  const userIds = [...new Set(fresh.map((c) => c.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const baseUrl = getBaseUrl();
  const subject = `A next step is waiting in ${BRAND.name}`;
  let sent = 0;
  let noEmail = 0;
  let failed = 0;

  for (const candidate of fresh) {
    const user = byId.get(candidate.userId);
    if (!user?.email) {
      noEmail += 1;
      continue;
    }
    try {
      const result = await sendEmail({
        to: user.email,
        subject,
        react: ProactiveNudgeEmail({ userName: user.name ?? 'there', baseUrl }),
      });
      if (result.status !== 'sent') {
        // 'failed' or 'disabled' — do NOT record the throttle row, so it's retried on the next sweep.
        failed += 1;
        continue;
      }
      // Record the send so a repeated sweep within the window won't re-nudge this journey.
      await prisma.frameworkJourneyNudge.upsert({
        where: { journeyId: candidate.journeyId },
        create: {
          userId: candidate.userId,
          journeyId: candidate.journeyId,
          nodeKey: candidate.nodeKey,
          nudgedAt: now,
        },
        update: { userId: candidate.userId, nodeKey: candidate.nodeKey, nudgedAt: now },
      });
      sent += 1;
    } catch (err) {
      logger.warn('Proactive nudge send failed', {
        journeyId: candidate.journeyId,
        error: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
    }
  }

  return {
    scanned,
    candidates: candidates.length,
    throttled: candidates.length - fresh.length,
    sent,
    noEmail,
    failed,
  };
}

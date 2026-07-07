/**
 * Module engagement stats (f-engagement t-3, spec §4.3, A9) — the read side.
 *
 * Every metric is DERIVED from the insert-only `JourneyEvent` stream, never a stored
 * counter (A9): counters drift and answer only pre-chosen questions; the stream recomputes
 * any metric over the full history. Aggregates mirror the shipped `groupBy`/`count`
 * precedent in `facilitation/journey/admin-queries.ts`.
 *
 * **Subject-scope seam.** `getModuleStats` accepts an optional `{ userId }` filter — the
 * #367 subject-scope axis at the analytics layer (`f-journey-state`'s indicative t-3). The
 * admin surface passes none today (a cross-user aggregate under `withAdminAuth`), but the
 * query is one WHERE clause from owner/team/cohort-scoped stats, not a rewrite.
 *
 * **Scale.** v1 reads are Prisma (`distinct` for unique users, a full feedback fetch for
 * the ratings summary) — fine at single-tenant volume. The scale follow-ups, when the event
 * table grows: a `framework_journey_event (moduleSlug, occurredAt)` index and a raw
 * `COUNT(DISTINCT …)` / DB-side rating rollup (deliberately NOT shipped speculatively).
 */

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { ENGAGEMENT_EVENT_TYPE } from '@/lib/framework/engagement/vocabulary';
import { JOURNEY_EVENT_TYPE } from '@/lib/framework/facilitation/journey/vocabulary';

/** How many recent comments the summary carries by default. */
const DEFAULT_RECENT_COMMENT_LIMIT = 5;

/** The stored shape of a `module.feedback` event's payload (validated — DB JSON is untyped). */
const feedbackPayloadSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

/** One recent free-text comment, wire-shaped (ISO date). */
export interface RecentComment {
  rating: number;
  comment: string;
  occurredAt: string;
}

/** Ratings summary derived from the module's `module.feedback` events. */
export interface ModuleFeedbackStats {
  /** Total feedback events with a valid payload. */
  count: number;
  /** Mean rating (2dp), or `null` when there is no feedback. */
  averageRating: number | null;
  /** Histogram of rating value → count, keys `'1'`..`'5'` (all present, zero-filled). */
  distribution: Record<string, number>;
  /** The most recent comments (those feedback events that carried one), newest first. */
  recentComments: RecentComment[];
}

/** Engagement stats for one module, all derived from the event stream (A9). */
export interface ModuleStats {
  moduleSlug: string;
  /** Distinct users with ANY event for the module. */
  uniqueUsers: number;
  /** `module.entered` count (sessions). */
  entries: number;
  /** `node_completed` count for the module's nodes (progression). */
  completions: number;
  /** Users with more than one entry (came back). */
  returningUsers: number;
  feedback: ModuleFeedbackStats;
}

/** Restrict stats to a subject (the #367 axis). Absent = all users (the admin default). */
export interface ModuleStatsFilter {
  userId?: string;
}

/**
 * Compute a module's engagement stats from the `JourneyEvent` stream. Cross-user by
 * default; pass `filter.userId` to scope every metric to one subject.
 */
export async function getModuleStats(
  moduleSlug: string,
  filter: ModuleStatsFilter = {},
  opts: { recentCommentLimit?: number } = {}
): Promise<ModuleStats> {
  const recentCommentLimit = opts.recentCommentLimit ?? DEFAULT_RECENT_COMMENT_LIMIT;
  // The shared filter: the module, optionally narrowed to one subject (the scope seam).
  const base: Prisma.JourneyEventWhereInput = {
    moduleSlug,
    ...(filter.userId !== undefined ? { userId: filter.userId } : {}),
  };

  const [distinctUsers, entries, completions, entriesPerUser, feedbackRows] = await Promise.all([
    prisma.journeyEvent.findMany({ where: base, select: { userId: true }, distinct: ['userId'] }),
    prisma.journeyEvent.count({ where: { ...base, type: ENGAGEMENT_EVENT_TYPE.moduleEntered } }),
    prisma.journeyEvent.count({ where: { ...base, type: JOURNEY_EVENT_TYPE.nodeCompleted } }),
    prisma.journeyEvent.groupBy({
      by: ['userId'],
      where: { ...base, type: ENGAGEMENT_EVENT_TYPE.moduleEntered },
      _count: { _all: true },
    }),
    prisma.journeyEvent.findMany({
      where: { ...base, type: ENGAGEMENT_EVENT_TYPE.moduleFeedback },
      select: { payload: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
    }),
  ]);

  return {
    moduleSlug,
    uniqueUsers: distinctUsers.length,
    entries,
    completions,
    returningUsers: entriesPerUser.filter((g) => g._count._all > 1).length,
    feedback: summariseFeedback(feedbackRows, recentCommentLimit),
  };
}

/** Fold the module's feedback events (newest first) into the ratings summary. */
function summariseFeedback(
  rows: Array<{ payload: Prisma.JsonValue | null; occurredAt: Date }>,
  recentCommentLimit: number
): ModuleFeedbackStats {
  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const recentComments: RecentComment[] = [];
  let sum = 0;
  let count = 0;

  for (const row of rows) {
    const parsed = feedbackPayloadSchema.safeParse(row.payload);
    if (!parsed.success) {
      // A payload we wrote ourselves should always parse; a malformed row is skipped
      // (never counted or crashes the whole read) rather than trusted.
      logger.warn('getModuleStats: skipping malformed module.feedback payload');
      continue;
    }
    const { rating, comment } = parsed.data;
    count += 1;
    sum += rating;
    distribution[String(rating)] += 1;
    // Rows are newest-first, so the first `limit` with a comment are the recent ones.
    if (comment !== undefined && recentComments.length < recentCommentLimit) {
      recentComments.push({ rating, comment, occurredAt: row.occurredAt.toISOString() });
    }
  }

  return {
    count,
    averageRating: count > 0 ? Math.round((sum / count) * 100) / 100 : null,
    distribution,
    recentComments,
  };
}

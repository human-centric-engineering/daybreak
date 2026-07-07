/**
 * Engagement vocabulary — the `JourneyEvent.type` values f-engagement (feature 08)
 * writes into the shared insert-only stream (spec §4.3).
 *
 * `JourneyEvent.type` is a free-form `String` (convention X1), so a new event kind is
 * never a migration and forks merge cleanly. The journey engine owns the traversal
 * kinds (`node_entered` / `node_completed`, in
 * `facilitation/journey/vocabulary.ts`); f-engagement owns the **engagement** kinds
 * here — the non-traversal user events the stats read side aggregates. Code that emits
 * an engagement event shares these constants so a typo can't silently mint an
 * unrecognised type the stats never count.
 *
 * Kept in the engagement feature (not the journey vocabulary) because these kinds are
 * a module-engagement concern, not journey traversal, and the client journey-replay
 * reducer has no use for them — feature cohesion over one shared bag of strings.
 */

/**
 * The engagement `JourneyEvent.type` values (spec §4.3):
 * - `module.entered` — a user opened a fresh module surface conversation (an "entry" /
 *   session). `journeyId` null (non-journey engagement), `moduleSlug` set.
 * - `module.feedback` — a user rated a module (payload `{ rating, comment? }`), via the
 *   `record_feedback` capability or the plain feedback API (t-2). `journeyId` null.
 *
 * Module *progression/completion* is not a new kind — the engine already writes
 * `node_entered` / `node_completed` stamped with `moduleSlug`, which the stats read side
 * reads directly.
 */
export const ENGAGEMENT_EVENT_TYPE = {
  moduleEntered: 'module.entered',
  moduleFeedback: 'module.feedback',
} as const;

/** A known engagement event-type literal. */
export type EngagementEventType =
  (typeof ENGAGEMENT_EVENT_TYPE)[keyof typeof ENGAGEMENT_EVENT_TYPE];

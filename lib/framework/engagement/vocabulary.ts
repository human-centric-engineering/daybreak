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
 * - `module.completed` — a user finished a module: every `module`-type map node for the
 *   slug is now node_completed for them (f-engagement-analytics t-3). Derived, emitted
 *   once per (user, module) from the transition caller — not the pure engine (F11).
 *   `moduleSlug` + `journeyId` set.
 *
 * Module *progression* is not a new kind — the engine already writes `node_entered` /
 * `node_completed` stamped with `moduleSlug`, which the stats read side reads directly.
 * `module.completed` IS its own kind because it is a derived, whole-module fact (all the
 * module's nodes done), not a single node transition.
 */
export const ENGAGEMENT_EVENT_TYPE = {
  moduleEntered: 'module.entered',
  moduleFeedback: 'module.feedback',
  moduleCompleted: 'module.completed',
} as const;

/** A known engagement event-type literal. */
export type EngagementEventType =
  (typeof ENGAGEMENT_EVENT_TYPE)[keyof typeof ENGAGEMENT_EVENT_TYPE];

/**
 * Module-lifecycle **binding** event types — operator actions that fire workflow
 * bindings but write **no `JourneyEvent`** (f-engagement-analytics t-3). Distinct from
 * {@link ENGAGEMENT_EVENT_TYPE} on purpose: these have no subject user, so they do not
 * belong in the `userId`-keyed, erasable engagement stream (the stats never count them).
 * They exist only as `runModuleWorkflowBindings` event-type literals.
 *
 * - `module.status_changed` — an operator changed a module's lifecycle status (payload
 *   `{ from, to }`), fired directly from `updateModuleSettings`.
 */
export const MODULE_LIFECYCLE_EVENT_TYPE = {
  statusChanged: 'module.status_changed',
} as const;

/** A known module-lifecycle binding event-type literal (no `JourneyEvent`). */
export type ModuleLifecycleEventType =
  (typeof MODULE_LIFECYCLE_EVENT_TYPE)[keyof typeof MODULE_LIFECYCLE_EVENT_TYPE];

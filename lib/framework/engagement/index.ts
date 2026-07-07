/**
 * f-engagement (feature 08) — module engagement event stream, feedback, and stats.
 *
 * The thin adapter that instruments the shipped module spine: it emits engagement events
 * into the shared insert-only `JourneyEvent` stream (and fires module→workflow bindings),
 * captures feedback, and derives module stats from the stream (A9 — never counters).
 *
 * t-1 (this): the emit seam + engagement vocabulary. t-2 adds `record_feedback` + the
 * feedback API; t-3 adds the stats read side.
 */

export { recordModuleEngagement } from '@/lib/framework/engagement/record-engagement';
export type { RecordModuleEngagementInput } from '@/lib/framework/engagement/record-engagement';
export { ENGAGEMENT_EVENT_TYPE } from '@/lib/framework/engagement/vocabulary';
export type { EngagementEventType } from '@/lib/framework/engagement/vocabulary';

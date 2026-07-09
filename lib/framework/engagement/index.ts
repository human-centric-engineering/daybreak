/**
 * f-engagement (feature 08) — module engagement event stream, feedback, and stats.
 *
 * The thin adapter that instruments the shipped module spine: it emits engagement events
 * into the shared insert-only `JourneyEvent` stream (and fires module→workflow bindings),
 * captures feedback, and derives module stats from the stream (A9 — never counters).
 *
 * t-1: the emit seam + engagement vocabulary. t-2: `record_feedback` + the feedback API.
 * t-3: the stats read side (`getModuleStats`).
 */

export { recordModuleEngagement } from '@/lib/framework/engagement/record-engagement';
export type { RecordModuleEngagementInput } from '@/lib/framework/engagement/record-engagement';
export { ENGAGEMENT_EVENT_TYPE } from '@/lib/framework/engagement/vocabulary';
export type { EngagementEventType } from '@/lib/framework/engagement/vocabulary';
export { getModuleStats } from '@/lib/framework/engagement/stats';
export type {
  ModuleStats,
  ModuleFeedbackStats,
  ModuleStatsFilter,
  RecentComment,
} from '@/lib/framework/engagement/stats';
export { getMapHeat } from '@/lib/framework/engagement/map-heat';
export type { MapHeat, MapNodeHeat, MapHeatFilter } from '@/lib/framework/engagement/map-heat';

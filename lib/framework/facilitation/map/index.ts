/**
 * Facilitation map — the authored map format (schema + validator).
 *
 * f-map t-1: pure, DB-free. The version service (t-2) parses drafts against
 * `mapDefinitionSchema` and runs `validateMapFormat` before publishing; the
 * engine (later) evaluates the conditions this format only shapes. See
 * `.context/framework/planning/f-map.md`.
 */

export {
  NODE_TYPES,
  EDGE_TYPES,
  CONDITION_FAMILIES,
  COMPLETION_MODES,
  TEMPORAL_KINDS,
  stateConditionSchema,
  slotConditionSchema,
  temporalConditionSchema,
  conditionSchema,
  onFirstArrivalSchema,
  nodeSchema,
  edgeSchema,
  mapDefinitionSchema,
} from '@/lib/framework/facilitation/map/schema';
export type {
  NodeType,
  EdgeType,
  ConditionFamily,
  CompletionMode,
  TemporalKind,
  MapCondition,
  MapNode,
  MapEdge,
  MapDefinition,
} from '@/lib/framework/facilitation/map/schema';
export { validateMapFormat } from '@/lib/framework/facilitation/map/validate';
export type {
  MapValidationError,
  MapValidationResult,
} from '@/lib/framework/facilitation/map/validate';
export {
  validatePublishableMap,
  createGraph,
  saveDraft,
  discardDraft,
  publishDraft,
  rollback,
  getPublishedMap,
  listVersions,
  getVersion,
} from '@/lib/framework/facilitation/map/version-service';
export type {
  CreateGraphArgs,
  SaveDraftArgs,
  DiscardDraftArgs,
  PublishDraftArgs,
  PublishResult,
  RollbackArgs,
  PublishedMap,
  ListVersionsOptions,
  ListVersionsResult,
} from '@/lib/framework/facilitation/map/version-service';
export { listGraphs, getGraphDetail } from '@/lib/framework/facilitation/map/queries';
export type { FacilitationGraphWithPublished } from '@/lib/framework/facilitation/map/queries';

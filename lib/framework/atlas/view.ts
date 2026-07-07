/**
 * The atlas composition projection — the wire shape of `GET /api/v1/admin/framework/atlas`
 * (f-atlas t-1).
 *
 * A **normalized** read-only projection: entity collections + a flat relationship list, NOT
 * pre-laid-out `@xyflow` nodes. The client mapper (t-2) turns entities → nodes and relationships
 * → edges and owns layout + semantic zoom (the same server-projection / client-mapper split
 * `journey/view.ts` + `journey-mapper.ts` use). Keeping the server a pure data projection is what
 * makes the atlas honest — it has no state of its own, so it cannot render a lie (X8).
 *
 * Cross-cutting entities that a lens inverts on (agents, workflows, slots, capabilities, knowledge)
 * are **top-level and deduped**, so "where else is this agent used?" is a scan of `edges`, not a
 * re-query. Facilitation-exclusive detail that no lens targets (policies) is embedded on the
 * facilitation node. Every relationship is an `AtlasEdge` with typed endpoints, so the client
 * resolves an endpoint to its entity collection unambiguously (ids can collide across types).
 *
 * Deliberately date-free: the atlas draws *structure*, not history — a binding's `createdAt` is not
 * shown (click through to the real editor for detail). So there is nothing to ISO-serialise here.
 */

/** The kinds of node an atlas endpoint can reference — the discriminant on {@link AtlasEndpoint}. */
export type AtlasEntityType =
  | 'module'
  | 'facilitation'
  | 'agent'
  | 'workflow'
  | 'slot'
  | 'capability'
  | 'knowledge'
  | 'map'
  | 'mapNode';

/** A typed reference to one entity (its `type` names the collection, `id` the member). */
export interface AtlasEndpoint {
  type: AtlasEntityType;
  id: string;
}

// ─── Entities ────────────────────────────────────────────────────────────────

/** A registered/retained module. `id` is the slug (stable, unique). */
export interface AtlasModule {
  /** The module slug — the entity id used by edges. */
  id: string;
  name: string;
  status: string;
  audience: string;
  /** false ⇒ the row is retained for audit but the module's code was removed. */
  isRegistered: boolean;
  /** Whether a `ModuleDefinition` is registered in code right now (the source of the below). */
  registeredInCode: boolean;
  /** One-line description from the code definition (null when the code is gone). */
  description: string | null;
  /** The bindable agent seats the code declares (empty when the code is gone). */
  agentRoles: string[];
}

/** A bound/seated `AiAgent`, deduped across module bindings + facilitation seats. `id` = agent id. */
export interface AtlasAgent {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  /** true ⇒ soft-deleted after being bound (`AiAgent.deletedAt` set) — a stale seat to clean up. */
  isTombstoned: boolean;
}

/** A bound `AiWorkflow`, deduped across module workflow bindings. `id` = workflow id. */
export interface AtlasWorkflow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  /** false ⇒ bound but unpublished, so it will be skipped at dispatch ("won't fire yet"). */
  hasPublishedVersion: boolean;
}

/** A slot definition. `id` is the slug. `scope` declares ownership (`global` / `facilitation` /
 *  `module:<slug>`); `sensitivity` + `visibility` are the atlas markers. */
export interface AtlasSlot {
  id: string;
  group: string;
  scope: string;
  visibility: string;
  sensitivity: string;
  dataType: string;
  isActive: boolean;
}

/** An agent capability. `id` is the (namespaced, for modules) slug. */
export interface AtlasCapability {
  id: string;
  kind: 'framework' | 'module';
}

/** A granted knowledge document or tag, deduped across module grants. `id` = `document:<id>` /
 *  `tag:<id>` (the kinds share an id space otherwise). */
export interface AtlasKnowledge {
  id: string;
  kind: 'document' | 'tag';
  name: string;
  slug: string;
  /** Document status (e.g. `ready`); null for tags. */
  status: string | null;
}

/** One node of a published map (the map's own topology is self-contained). */
export interface AtlasMapNode {
  key: string;
  type: string;
  /** Set when `type === 'module'` — the module this place binds. */
  moduleSlug: string | null;
  /** The containing region node key (F5), if any. */
  region: string | null;
}

/** A published facilitation map. `id` is the slug. `version` is null when unpublished or the stored
 *  definition failed to parse (degrades to an empty topology rather than breaking the whole atlas). */
export interface AtlasMap {
  id: string;
  name: string;
  version: number | null;
  nodes: AtlasMapNode[];
  edges: { from: string; to: string; type: string }[];
}

/** A facilitation policy summary — embedded on the facilitation node (no lens targets it). */
export interface AtlasPolicy {
  id: string;
  kind: string;
  enabled: boolean;
}

/** The facilitation layer as a single node: its seats/policies unfold as satellites. Its bound
 *  agents / owned slots / granted capabilities are represented as {@link AtlasEdge}s (shared,
 *  lens-able); its policies are embedded here (facilitation-exclusive). */
export interface AtlasFacilitation {
  /** Every declared seat, with its bound agent id (null ⇒ unfilled seat). */
  seats: { role: string; agentId: string | null }[];
  policies: AtlasPolicy[];
}

// ─── Relationships ───────────────────────────────────────────────────────────

/** The composition relationship kinds — a module's bindings/grants and the facilitation layer's,
 *  plus a map place binding a module. */
export type AtlasEdgeKind =
  | 'module_agent'
  | 'module_workflow'
  | 'module_slot'
  | 'module_capability'
  | 'module_knowledge'
  | 'facilitation_agent'
  | 'facilitation_slot'
  | 'facilitation_capability'
  | 'map_module';

/** One composition relationship with typed endpoints. `label` carries the human tag (a binding's
 *  `role` / `eventType`); `meta` carries flags the client renders as badges (`isPrimary`,
 *  `enabled`). */
export interface AtlasEdge {
  kind: AtlasEdgeKind;
  source: AtlasEndpoint;
  target: AtlasEndpoint;
  label?: string;
  meta?: Record<string, boolean>;
}

// ─── The projection ──────────────────────────────────────────────────────────

/** The whole composition graph, normalized. Assembled by `assembleComposition()`. */
export interface CompositionProjection {
  modules: AtlasModule[];
  facilitation: AtlasFacilitation;
  agents: AtlasAgent[];
  workflows: AtlasWorkflow[];
  slots: AtlasSlot[];
  capabilities: AtlasCapability[];
  knowledge: AtlasKnowledge[];
  maps: AtlasMap[];
  edges: AtlasEdge[];
}

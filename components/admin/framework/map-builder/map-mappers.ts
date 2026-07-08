/**
 * Pure mappers between a stored `MapDefinition` and the React Flow `nodes` / `edges`
 * the map editor canvas consumes (f-map-editor t-1). The authoring analogue of the
 * read-only explorer's `journey-mapper.ts`: intentionally free of React / React Flow
 * *runtime* imports (types only) so the round-trip unit-tests without a DOM.
 *
 * Layout persistence (decision 2): maps carry no authored x/y, so a node's canvas
 * position lives in a reserved `meta._layout` `{ x, y }` — schema-compatible (`meta`
 * is a free-form `z.record`), no migration, mirroring the workflow builder's
 * `config._layout` convention. On load, a node with a stored `_layout` uses it;
 * an unpositioned node is seeded by the journey explorer's `layoutJourney` (a
 * Kahn longest-path layer over the structural edges), reused verbatim. On save,
 * each node's current position is written back into `meta._layout`.
 *
 * Edges round-trip fully here even though *drawing* + typing them is t-2: a map
 * authored via the API (or a later task) loads and re-saves without losing its
 * edges. The edge's `type` and optional `condition` ride in `edge.data` so t-2's
 * inspector can read/write them.
 */

import type { Edge, Node } from '@xyflow/react';

import { layoutJourney } from '@/components/admin/framework/journey-explorer/journey-mapper';
import type {
  CompletionMode,
  MapCondition,
  MapDefinition,
  MapEdge,
  MapNode,
  NodeType,
} from '@/lib/framework/facilitation/map/schema';

/** The reserved `meta` key holding a node's canvas position. */
const LAYOUT_KEY = '_layout';

/** React Flow node type discriminator for every map node (styling keys off `data.nodeType`). */
const NODE_TYPE = 'map' as const;

/** React Flow edge type discriminator for every map edge (styling keys off `data.edgeType`). */
export const EDGE_FLOW_TYPE = 'map' as const;

interface StoredLayout {
  x: number;
  y: number;
}

/** The data payload the custom `MapNode` renders / the editor round-trips. */
export interface MapNodeData extends Record<string, unknown> {
  /** The node key — its stable map identity, shown as the label. */
  label: string;
  nodeType: NodeType;
  /** Bound module slug for `module` nodes. */
  moduleSlug?: string;
  /** Maturity level this node belongs to. */
  stage?: string;
  /** Key of the containing region node (F5). */
  region?: string;
  completionMode: CompletionMode;
  onFirstArrival?: { workflowSlug?: string; agentSlug?: string };
  /** Authored metadata, minus the internal `_layout` (re-derived from `position`). */
  meta?: Record<string, unknown>;
  /** Transient live-validation flag (t-3 paints a ring). Never persisted. */
  hasError?: boolean;
}

export type MapFlowNode = Node<MapNodeData, 'map'>;

/** Edge payload carrying the typed-edge vocabulary through the round-trip. */
export interface MapEdgeData extends Record<string, unknown> {
  edgeType: MapEdge['type'];
  condition?: MapCondition;
  /** Authored edge metadata, opaque to the engine — preserved across the round-trip. */
  meta?: Record<string, unknown>;
}

export type MapFlowEdge = Edge<MapEdgeData>;

/** Read the persisted `{ x, y }` from a node's `meta._layout`, or null if absent/malformed. */
function readLayout(meta: Record<string, unknown> | undefined): StoredLayout | null {
  const raw = meta?.[LAYOUT_KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return null;
  return { x: obj.x, y: obj.y };
}

/**
 * Strip the internal `_layout` key from a `meta` bag so it never reaches the node
 * data payload (position is the single source of truth on the canvas). Returns
 * `undefined` when nothing meaningful is left, so an unadorned node stays clean.
 */
export function stripLayout(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  if (!(LAYOUT_KEY in meta)) return Object.keys(meta).length > 0 ? meta : undefined;
  const copy = { ...meta };
  delete copy[LAYOUT_KEY];
  return Object.keys(copy).length > 0 ? copy : undefined;
}

/**
 * Convert a stored `MapDefinition` into React Flow nodes + edges. Positions come
 * from each node's persisted `meta._layout`; unpositioned nodes are seeded by
 * `layoutJourney` (the longest-path layered layout the explorer already ships).
 */
export function mapDefinitionToFlow(definition: MapDefinition): {
  nodes: MapFlowNode[];
  edges: Edge<MapEdgeData>[];
} {
  const auto = layoutJourney(definition);
  const autoPos = new Map(auto.baseNodes.map((n) => [n.key, n.position]));
  const keys = new Set(definition.nodes.map((n) => n.key));

  const nodes: MapFlowNode[] = definition.nodes.map((node) => {
    const stored = readLayout(node.meta);
    const position = stored ?? autoPos.get(node.key) ?? { x: 0, y: 0 };
    const dataMeta = stripLayout(node.meta);
    return {
      id: node.key,
      type: NODE_TYPE,
      position,
      data: {
        label: node.key,
        nodeType: node.type,
        ...(node.moduleSlug ? { moduleSlug: node.moduleSlug } : {}),
        ...(node.stage ? { stage: node.stage } : {}),
        ...(node.region ? { region: node.region } : {}),
        completionMode: node.completionMode,
        ...(node.onFirstArrival ? { onFirstArrival: node.onFirstArrival } : {}),
        ...(dataMeta ? { meta: dataMeta } : {}),
        hasError: false,
      },
    };
  });

  const edges: Edge<MapEdgeData>[] = definition.edges
    // Drop any edge whose endpoints no longer resolve — a malformed authored map
    // shouldn't crash the canvas (the publish validator reports it separately).
    .filter((e) => keys.has(e.from) && keys.has(e.to))
    .map((e, i) => ({
      id: `${e.from}__${e.to}__${e.type}__${i}`,
      source: e.from,
      target: e.to,
      // The custom `MapEdge` component (registered under this type) styles + labels
      // the edge from `data.edgeType`, so no top-level `label` here.
      type: EDGE_FLOW_TYPE,
      data: {
        edgeType: e.type,
        ...(e.condition ? { condition: e.condition } : {}),
        ...(e.meta ? { meta: e.meta } : {}),
      },
    }));

  return { nodes, edges };
}

/**
 * Convert React Flow nodes + edges back into a `MapDefinition`, stashing each node's
 * x/y into `meta._layout` so the next open restores the layout exactly. The output
 * is shaped to satisfy `mapDefinitionSchema` (the PATCH-body validator): node `key`
 * is the flow node id, `completionMode` is always present, and a `module` node
 * carries its `moduleSlug`.
 */
export function flowToMapDefinition(
  nodes: readonly MapFlowNode[],
  edges: readonly Edge<MapEdgeData>[]
): MapDefinition {
  const nodeIds = new Set(nodes.map((n) => n.id));

  const mapNodes: MapNode[] = nodes.map((node) => {
    const d = node.data;
    const baseMeta = stripLayout(d.meta) ?? {};
    const meta: Record<string, unknown> = {
      ...baseMeta,
      [LAYOUT_KEY]: { x: node.position.x, y: node.position.y },
    };
    return {
      key: node.id,
      type: d.nodeType,
      ...(d.moduleSlug ? { moduleSlug: d.moduleSlug } : {}),
      ...(d.stage ? { stage: d.stage } : {}),
      ...(d.region ? { region: d.region } : {}),
      completionMode: d.completionMode,
      ...(d.onFirstArrival ? { onFirstArrival: d.onFirstArrival } : {}),
      meta,
    };
  });

  const mapEdges: MapEdge[] = edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      from: e.source,
      to: e.target,
      type: e.data?.edgeType ?? 'prerequisite',
      ...(e.data?.condition ? { condition: e.data.condition } : {}),
      ...(e.data?.meta ? { meta: e.data.meta } : {}),
    }));

  return { nodes: mapNodes, edges: mapEdges };
}

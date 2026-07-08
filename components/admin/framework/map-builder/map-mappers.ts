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
import {
  LAYOUT_KEY,
  REGION_COLLAPSED_HEIGHT,
  REGION_DEFAULT_SIZE,
  SIZE_KEY,
  COLLAPSED_KEY,
  absoluteFlowPosition,
  readCollapsed,
  readLayout,
  readSize,
  stripReserved,
} from '@/components/admin/framework/map-builder/region-membership';

/** React Flow node type discriminator for an ordinary map node (styling keys off `data.nodeType`). */
const NODE_TYPE = 'map' as const;

/** React Flow node type discriminator for a region container (F5). */
export const REGION_FLOW_TYPE = 'region' as const;

/** React Flow edge type discriminator for every map edge (styling keys off `data.edgeType`). */
export const EDGE_FLOW_TYPE = 'map' as const;

/** The data payload the custom `MapNode` / `RegionNode` renders and the editor round-trips. */
export interface MapNodeData extends Record<string, unknown> {
  /** The node key — its stable map identity, shown as the label. */
  label: string;
  nodeType: NodeType;
  /** Bound module slug for `module` nodes. */
  moduleSlug?: string;
  /** Maturity level this node belongs to. */
  stage?: string;
  /** Key of the containing region node (F5); kept in sync with the flow `parentId`. */
  region?: string;
  completionMode: CompletionMode;
  onFirstArrival?: { workflowSlug?: string; agentSlug?: string };
  /** Region-only: whether the container is collapsed (members hidden, box shrunk). */
  collapsed?: boolean;
  /** Region-only: the height to restore to on expand (remembered while collapsed). */
  expandedHeight?: number;
  /** Authored metadata, minus the reserved UI keys (re-derived from the flow node). */
  meta?: Record<string, unknown>;
  /** Transient live-validation flag (t-3 paints a ring). Never persisted. */
  hasError?: boolean;
}

export type MapFlowNode = Node<MapNodeData, 'map' | 'region'>;

/** Edge payload carrying the typed-edge vocabulary through the round-trip. */
export interface MapEdgeData extends Record<string, unknown> {
  edgeType: MapEdge['type'];
  condition?: MapCondition;
  /** Authored edge metadata, opaque to the engine — preserved across the round-trip. */
  meta?: Record<string, unknown>;
}

export type MapFlowEdge = Edge<MapEdgeData>;

/**
 * Convert a stored `MapDefinition` into React Flow nodes + edges. Positions come from
 * each node's persisted `meta._layout` (absolute); unpositioned nodes are seeded by
 * `layoutJourney`. Region membership (`node.region`) becomes React Flow parent/child:
 * a member gets `parentId` + `extent:'parent'` and a **parent-relative** position, and
 * regions render as sized group containers (`type:'region'`, collapsed members hidden).
 * Parents are emitted before their children (a React Flow requirement).
 */
export function mapDefinitionToFlow(definition: MapDefinition): {
  nodes: MapFlowNode[];
  edges: Edge<MapEdgeData>[];
} {
  const auto = layoutJourney(definition);
  const autoPos = new Map(auto.baseNodes.map((n) => [n.key, n.position]));
  const keys = new Set(definition.nodes.map((n) => n.key));
  const byKey = new Map(definition.nodes.map((n) => [n.key, n]));

  // Absolute position for every node (stored, else auto-laid-out).
  const absByKey = new Map<string, { x: number; y: number }>();
  for (const node of definition.nodes) {
    absByKey.set(node.key, readLayout(node.meta) ?? autoPos.get(node.key) ?? { x: 0, y: 0 });
  }

  // A node's containing region, only when it resolves to a real region-type node.
  const parentOf = (node: MapNode): string | undefined =>
    node.region && byKey.get(node.region)?.type === 'region' ? node.region : undefined;

  const collapsedByKey = new Map<string, boolean>();
  for (const n of definition.nodes) {
    if (n.type === 'region') collapsedByKey.set(n.key, readCollapsed(n.meta));
  }

  // Region-containment depth, for the parents-before-children ordering + hidden calc.
  const depthOf = (node: MapNode): number => {
    let d = 0;
    let cur: string | undefined = parentOf(node);
    const seen = new Set<string>();
    while (cur && byKey.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      d += 1;
      const next = byKey.get(cur);
      cur = next ? parentOf(next) : undefined;
    }
    return d;
  };
  const anyAncestorCollapsed = (node: MapNode): boolean => {
    let cur: string | undefined = parentOf(node);
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (collapsedByKey.get(cur)) return true;
      const next = byKey.get(cur);
      cur = next ? parentOf(next) : undefined;
    }
    return false;
  };

  const ordered = [...definition.nodes].sort((a, b) => depthOf(a) - depthOf(b));

  const nodes: MapFlowNode[] = ordered.map((node) => {
    const abs = absByKey.get(node.key) ?? { x: 0, y: 0 };
    const parentId = parentOf(node);
    const parentAbs = parentId ? (absByKey.get(parentId) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
    const position = parentId ? { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y } : abs;
    const hidden = anyAncestorCollapsed(node);
    const dataMeta = stripReserved(node.meta);

    const data: MapNodeData = {
      label: node.key,
      nodeType: node.type,
      ...(node.moduleSlug ? { moduleSlug: node.moduleSlug } : {}),
      ...(node.stage ? { stage: node.stage } : {}),
      ...(parentId ? { region: parentId } : {}),
      completionMode: node.completionMode,
      ...(node.onFirstArrival ? { onFirstArrival: node.onFirstArrival } : {}),
      ...(dataMeta ? { meta: dataMeta } : {}),
      hasError: false,
    };

    if (node.type === 'region') {
      const size = readSize(node.meta) ?? REGION_DEFAULT_SIZE;
      const collapsed = collapsedByKey.get(node.key) ?? false;
      return {
        id: node.key,
        type: REGION_FLOW_TYPE,
        position,
        width: size.width,
        height: collapsed ? REGION_COLLAPSED_HEIGHT : size.height,
        ...(parentId ? { parentId, extent: 'parent' as const } : {}),
        ...(hidden ? { hidden: true } : {}),
        data: { ...data, collapsed, expandedHeight: size.height },
      };
    }

    return {
      id: node.key,
      type: NODE_TYPE,
      position,
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
      ...(hidden ? { hidden: true } : {}),
      data,
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
 * Convert React Flow nodes + edges back into a `MapDefinition`, resolving each node's
 * **absolute** x/y (a member's position is parent-relative on the canvas) back into
 * `meta._layout`, and a region's size + collapsed state into `meta._size` /
 * `meta._collapsed`. Membership comes from the flow `parentId` → `node.region`. The
 * output satisfies `mapDefinitionSchema`: node `key` is the flow id, `completionMode`
 * is always present, and a `module` node carries its `moduleSlug`.
 */
export function flowToMapDefinition(
  nodes: readonly MapFlowNode[],
  edges: readonly Edge<MapEdgeData>[]
): MapDefinition {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const mapNodes: MapNode[] = nodes.map((node) => {
    const d = node.data;
    const abs = absoluteFlowPosition(node, byId);
    const baseMeta = stripReserved(d.meta) ?? {};
    const meta: Record<string, unknown> = {
      ...baseMeta,
      [LAYOUT_KEY]: { x: abs.x, y: abs.y },
    };

    if (node.type === REGION_FLOW_TYPE) {
      // Persist the EXPANDED size: while collapsed the live height is the header
      // height, so fall back to the remembered `expandedHeight`.
      const width = node.width ?? node.measured?.width ?? REGION_DEFAULT_SIZE.width;
      const height = d.collapsed
        ? (d.expandedHeight ?? REGION_DEFAULT_SIZE.height)
        : (node.height ?? node.measured?.height ?? REGION_DEFAULT_SIZE.height);
      meta[SIZE_KEY] = { width, height };
      if (d.collapsed) meta[COLLAPSED_KEY] = true;
    }

    // Membership is authoritative from the flow parent; fall back to `data.region`
    // for a node that has one but isn't parented (shouldn't happen post-load).
    const region = node.parentId ?? d.region;

    return {
      key: node.id,
      type: d.nodeType,
      ...(d.moduleSlug ? { moduleSlug: d.moduleSlug } : {}),
      ...(d.stage ? { stage: d.stage } : {}),
      ...(region ? { region } : {}),
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

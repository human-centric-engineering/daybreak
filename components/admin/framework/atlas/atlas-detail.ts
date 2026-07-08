/**
 * Semantic-zoom detail logic for the atlas (f-atlas t-2b) — pure TS (types-only `@xyflow` import),
 * so it unit-tests without a DOM.
 *
 * The atlas is "semantic": zoomed out it shows only the **primaries** (modules, the facilitation
 * layer, published maps) and the inter-primary `map→module` links — the big picture of what exists
 * and which maps use which modules. Zoom in past a threshold (or force it with the toggle) and each
 * primary's **satellites** (its agents / workflows / slots / capabilities / knowledge) unfold, exactly
 * the spec's "zoom into a module and its composition unfolds" (§5.6). This declutters a large atlas
 * without dropping any data — hidden nodes/edges are still in the graph, just not drawn.
 *
 * `applyDetail` sets React Flow's `hidden` flag (it never removes nodes/edges), so toggling back is
 * instant and the layout never re-flows.
 */

import type { Edge } from '@xyflow/react';

import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';
import type { AtlasEntityType } from '@/lib/framework/atlas/view';

/** The kinds that stay visible at every zoom — the composition's hubs. */
export const PRIMARY_KINDS: ReadonlySet<AtlasEntityType> = new Set([
  'module',
  'facilitation',
  'map',
]);

/** The kinds that unfold only when zoomed in (or forced) — a primary's parts. */
export const SATELLITE_KINDS: ReadonlySet<AtlasEntityType> = new Set([
  'agent',
  'workflow',
  'slot',
  'capability',
  'knowledge',
]);

/**
 * The zoom at/above which satellites unfold. Absolute (React Flow zoom units), tuned for a typical
 * atlas — a large deployment fits at a lower zoom, so this is a starting default, not a law; the
 * "Show all detail" toggle overrides it either way.
 */
export const DETAIL_ZOOM = 0.75;

/** Whether a node kind is a satellite (unfolds on zoom) rather than a primary (always shown). */
export function isSatelliteKind(kind: AtlasEntityType): boolean {
  return SATELLITE_KINDS.has(kind);
}

/**
 * Return the nodes/edges with React Flow's `hidden` flag set for the given detail level. When
 * `showDetail` is true everything is visible; when false, satellite nodes and any edge touching a
 * satellite are hidden (primaries + inter-primary `map→module` edges stay). Never mutates its inputs;
 * always sets `hidden` explicitly so toggling detail back on clears a previously-hidden flag.
 */
export function applyDetail(
  nodes: readonly AtlasFlowNode[],
  edges: readonly Edge[],
  showDetail: boolean
): { nodes: AtlasFlowNode[]; edges: Edge[] } {
  const kindById = new Map(nodes.map((n) => [n.id, n.data.kind]));
  const touchesSatellite = (e: Edge): boolean => {
    const s = kindById.get(e.source);
    const t = kindById.get(e.target);
    return (s !== undefined && isSatelliteKind(s)) || (t !== undefined && isSatelliteKind(t));
  };

  return {
    nodes: nodes.map((n) => ({ ...n, hidden: !showDetail && isSatelliteKind(n.data.kind) })),
    edges: edges.map((e) => ({ ...e, hidden: !showDetail && touchesSatellite(e) })),
  };
}

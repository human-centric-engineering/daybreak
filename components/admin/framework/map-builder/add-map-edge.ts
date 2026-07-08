/**
 * Factory for new map edges drawn on the canvas (f-map-editor t-2).
 *
 * Kept out of the React component so it unit-tests as plain TS. A freshly-drawn
 * connection becomes a default `prerequisite` edge (decision 6: draw-then-inspect —
 * the author retypes it in the edge inspector), carrying the custom edge type so the
 * `MapEdge` component renders it.
 */

import type { Connection, Edge } from '@xyflow/react';

import {
  EDGE_FLOW_TYPE,
  type MapEdgeData,
} from '@/components/admin/framework/map-builder/map-mappers';
import { DEFAULT_EDGE_TYPE } from '@/components/admin/framework/map-builder/map-edge-kinds';
import type { EdgeType } from '@/lib/framework/facilitation/map/schema';

/** A short unique suffix so two edges between the same pair don't collide on id. */
function edgeSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Build a map edge from a drawn `Connection`, or `null` when the connection is
 * degenerate (no endpoints, or a self-loop — a node can't gate itself).
 */
export function makeMapEdge(
  connection: Connection,
  edgeType: EdgeType = DEFAULT_EDGE_TYPE
): Edge<MapEdgeData> | null {
  const { source, target } = connection;
  if (!source || !target || source === target) return null;

  return {
    id: `edge_${source}__${target}__${edgeSuffix()}`,
    source,
    target,
    type: EDGE_FLOW_TYPE,
    data: { edgeType },
  };
}

/**
 * Pure mapper from a published map + its collective heat to the React Flow nodes the
 * heat canvas renders (f-engagement-analytics t-1b). The heat analogue of the journey
 * mapper: it REUSES the pure {@link layoutJourney} for positions + edges (structure is
 * the same geography), then folds each node's `MapHeat` figures + the active metric's
 * intensity bucket onto the base nodes. React/React-Flow types only, so it unit-tests
 * without a DOM.
 *
 * A node the heat stream has no activity for stays bucket 0 (neutral) with zero figures —
 * `getMapHeat` returns only active nodes, so cold structural nodes are simply absent from
 * the heat map and default here. An event for a node the published map no longer contains
 * has nowhere to render and is dropped (the structure is the source of truth for layout).
 */

import type { Edge } from '@xyflow/react';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type { MapHeat, MapNodeHeat } from '@/lib/framework/engagement/map-heat';
import { layoutJourney } from '@/components/admin/framework/journey-explorer/journey-mapper';
import {
  type HeatMetric,
  type IntensityBucket,
  intensityBucket,
  metricValue,
} from '@/components/admin/framework/map-heat/map-heat-styles';
import type { Node, NodeProps } from '@xyflow/react';

/** Zero figures for a structural node the heat stream has no activity for. */
const EMPTY_HEAT: Omit<MapNodeHeat, 'nodeKey'> = {
  distinctUsers: 0,
  entries: 0,
  completions: 0,
  enteredUsers: 0,
  completedUsers: 0,
  dropOff: 0,
};

/** The data a heat node renders: its key, type, and collective figures + colour bucket. */
export interface MapHeatNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  moduleSlug?: string;
  heat: Omit<MapNodeHeat, 'nodeKey'>;
  /** The active metric's intensity bucket (0 neutral … 4 the map max). */
  bucket: IntensityBucket;
  metric: HeatMetric;
}

export type MapHeatFlowNode = Node<MapHeatNodeData, 'heat'>;
export type MapHeatNodeProps = NodeProps<MapHeatFlowNode>;

/**
 * Lay the published structure out (reusing the journey layout) and fold the collective
 * heat + the active metric's bucket onto each node. The max for bucketing is the busiest
 * node **on this map** for the active metric, so colour is relative to the map, not global.
 */
export function toHeatFlow(
  structure: MapDefinition,
  heat: MapHeat,
  metric: HeatMetric
): { nodes: MapHeatFlowNode[]; edges: Edge[] } {
  const { baseNodes, edges } = layoutJourney(structure);
  const heatByNode = new Map(heat.nodes.map((n) => [n.nodeKey, n]));

  // Resolve each STRUCTURAL node's figures first (zero-filled when cold). Heat for a
  // nodeKey the published map no longer contains has nowhere to render and is dropped.
  const withFigures = baseNodes.map((n) => ({ n, figures: heatByNode.get(n.key) ?? EMPTY_HEAT }));

  // The colour scale is relative to the busiest RENDERED node for the active metric — a
  // stale (dropped) heat node must not skew the visible scale (0 when nothing has activity).
  const max = withFigures.reduce((m, { figures }) => Math.max(m, metricValue(figures, metric)), 0);

  const nodes: MapHeatFlowNode[] = withFigures.map(({ n, figures }) => ({
    id: n.key,
    type: 'heat',
    position: n.position,
    data: {
      label: n.key,
      nodeType: n.nodeType,
      ...(n.moduleSlug ? { moduleSlug: n.moduleSlug } : {}),
      heat: figures,
      bucket: intensityBucket(metricValue(figures, metric), max),
      metric,
    },
  }));

  return { nodes, edges };
}

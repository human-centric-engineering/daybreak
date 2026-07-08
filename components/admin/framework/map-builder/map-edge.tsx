'use client';

/**
 * MapEdge (f-map-editor t-2) — the custom canvas edge, one component for all four
 * typed edges (styling keys off `data.edgeType`, mirroring how `MapNode` handles the
 * four node kinds). Structural edges render solid, advisory edges dashed, each in its
 * kind's colour; a gating condition shows as a small ⚡ badge on the edge; selection
 * thickens the stroke.
 *
 * Presentational: the parent `<MapBuilder>` owns edge state and selection; this only
 * paints one edge from its `data`.
 */

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  DEFAULT_EDGE_TYPE,
  mapEdgeKind,
} from '@/components/admin/framework/map-builder/map-edge-kinds';
import {
  EDGE_FLOW_TYPE,
  type MapEdgeData,
} from '@/components/admin/framework/map-builder/map-mappers';

export function MapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps): React.ReactElement {
  const edgeType = (data as MapEdgeData | undefined)?.edgeType ?? DEFAULT_EDGE_TYPE;
  const hasCondition = Boolean((data as MapEdgeData | undefined)?.condition);
  const kind = mapEdgeKind(edgeType);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: kind.stroke,
          strokeWidth: selected ? 3 : 1.5,
          ...(kind.dash ? { strokeDasharray: kind.dash } : {}),
        }}
      />
      <EdgeLabelRenderer>
        <div
          data-testid={`map-edge-label-${id}`}
          data-edge-type={edgeType}
          className={cn(
            'bg-background/90 pointer-events-none absolute flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shadow-sm',
            selected ? 'ring-primary ring-1' : ''
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            borderColor: kind.stroke,
            color: kind.stroke,
          }}
        >
          {hasCondition && <Zap className="h-2.5 w-2.5" aria-label="gated" />}
          <span>{kind.label}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/** The `edgeTypes` map for the map canvas (one custom type, styled by `data.edgeType`).
 *  Frozen at module scope per the React Flow recommendation; the key is the shared
 *  `EDGE_FLOW_TYPE` so the registry and `defaultEdgeOptions.type` can't drift. */
export const mapEdgeTypes = { [EDGE_FLOW_TYPE]: MapEdge } as const;

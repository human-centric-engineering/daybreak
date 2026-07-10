'use client';

/**
 * The read-only map-heat canvas node (f-engagement-analytics t-1b) — one place on a
 * map, coloured by the active metric's intensity bucket and labelled with its collective
 * figures (distinct users, entries/completions, drop-off). Presentational only: no
 * drag/connect affordances beyond the handles React Flow needs to route edges. Colour
 * comes from the shared ramp so the node and legend can't drift.
 */

import { Handle, Position } from '@xyflow/react';

import { Badge } from '@/components/ui/badge';
import type { MapHeatNodeProps } from '@/components/admin/framework/map-heat/map-heat-mapper';
import { bucketNodeClass } from '@/components/admin/framework/map-heat/map-heat-styles';

export function MapHeatNode({ data }: MapHeatNodeProps) {
  const { heat, bucket, metric } = data;
  const nodeClass = bucketNodeClass(bucket, metric);

  return (
    <div
      data-testid="map-heat-node"
      data-bucket={bucket}
      className={`min-w-44 rounded-md border-2 px-3 py-2 shadow-sm ${nodeClass}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium break-all">{data.label}</span>
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {data.nodeType}
        </span>
      </div>
      {data.moduleSlug && (
        <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">{data.moduleSlug}</p>
      )}
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-muted-foreground">Users</dt>
        <dd className="text-right tabular-nums">{heat.distinctUsers.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Entries</dt>
        <dd className="text-right tabular-nums">{heat.entries.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Completions</dt>
        <dd className="text-right tabular-nums">{heat.completions.toLocaleString()}</dd>
      </dl>
      {heat.dropOff > 0 && (
        <Badge variant="outline" className="mt-1.5 text-[10px]">
          {heat.dropOff.toLocaleString()} dropped
        </Badge>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** The `nodeTypes` map for the heat canvas (one custom type). */
export const mapHeatNodeTypes = { heat: MapHeatNode };

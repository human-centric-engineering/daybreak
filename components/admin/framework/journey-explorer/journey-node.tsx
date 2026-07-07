'use client';

/**
 * The read-only journey canvas node (f-ops-views t-5b) — one place in a user's map,
 * coloured by its journey status (live projection or replayed). Presentational only:
 * no drag/connect affordances beyond the handles React Flow needs to route edges.
 * The status→style map covers the five known statuses (journey vocabulary); an
 * unknown/absent status (X1) falls through to the neutral `unvisited` treatment.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { JourneyFlowNode } from '@/components/admin/framework/journey-explorer/journey-mapper';
import {
  JOURNEY_STATUS_STYLES,
  UNVISITED_STATUS_STYLE,
} from '@/components/admin/framework/journey-explorer/journey-status-styles';

export function JourneyNode({ data }: NodeProps<JourneyFlowNode>) {
  const statusStyle = (JOURNEY_STATUS_STYLES[data.status] ?? UNVISITED_STATUS_STYLE).node;

  return (
    <div
      data-testid="journey-node"
      data-status={data.status}
      className={`min-w-40 rounded-md border-2 px-3 py-2 shadow-sm transition-shadow ${statusStyle} ${
        data.isCurrent ? 'ring-primary ring-2 ring-offset-1' : ''
      }`}
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
      <p className="text-muted-foreground mt-1 text-xs capitalize">{data.status}</p>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** The `nodeTypes` map for the journey canvas (one custom type). */
export const journeyNodeTypes = { journey: JourneyNode };

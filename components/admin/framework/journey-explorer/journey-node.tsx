'use client';

/**
 * The read-only journey canvas node (f-ops-views t-5b) — one place in a user's map,
 * coloured by its journey status (live projection or replayed). Presentational only:
 * no drag/connect affordances beyond the handles React Flow needs to route edges.
 * The status→style map covers the five known statuses (journey vocabulary); an
 * unknown/absent status (X1) falls through to the neutral `unvisited` treatment.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';
import type { JourneyFlowNode } from '@/components/admin/framework/journey-explorer/journey-mapper';

/** Border + fill per journey status. `unvisited` is the neutral fallback. */
const STATUS_STYLES: Record<string, string> = {
  [NODE_STATE_STATUS.completed]:
    'border-green-500 bg-green-50 dark:border-green-500 dark:bg-green-950/40',
  [NODE_STATE_STATUS.active]:
    'border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/40',
  [NODE_STATE_STATUS.available]:
    'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40',
  [NODE_STATE_STATUS.visited]:
    'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-900/60',
  [NODE_STATE_STATUS.unvisited]: 'border-border bg-background',
};

export function JourneyNode({ data }: NodeProps<JourneyFlowNode>) {
  const statusStyle = STATUS_STYLES[data.status] ?? STATUS_STYLES[NODE_STATE_STATUS.unvisited];

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

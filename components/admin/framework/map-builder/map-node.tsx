'use client';

/**
 * MapNode (f-map-editor t-1) — the editable canvas node, one per authored map place.
 * Cribbed from the read-only explorer's `journey-node.tsx`, but coloured by node
 * *kind* (module / stage / milestone / region) rather than journey status, and with
 * live connect handles (edge drawing arrives in t-2). Presentational: the parent
 * `<MapBuilder>` owns all state; this only paints `data`.
 *
 * Selection is a `ring-primary` outline; a live-validation error (t-3) wins the ring
 * colour over selection.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/utils';
import { mapNodeKind } from '@/components/admin/framework/map-builder/map-node-kinds';
import { RegionNode } from '@/components/admin/framework/map-builder/region-group';
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

export function MapNode({ data, selected }: NodeProps<MapFlowNode>) {
  const kind = mapNodeKind(data.nodeType);
  const Icon = kind.icon;
  const hasError = Boolean(data.hasError);

  return (
    <div
      data-testid={`map-node-${data.nodeType}`}
      data-node-key={data.label}
      className={cn(
        'min-w-40 rounded-md border-2 px-3 py-2 shadow-sm transition-shadow',
        kind.surface,
        selected && !hasError && 'ring-primary shadow-md ring-2',
        hasError && 'shadow-md ring-2 ring-red-500 dark:ring-red-400'
      )}
    >
      {hasError && <span className="sr-only">Node has validation errors</span>}
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span
          className={cn('flex h-6 w-6 items-center justify-center rounded', kind.iconChip)}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-sm font-medium break-all">{data.label}</span>
        <span className="text-[10px] tracking-wide uppercase opacity-70">{data.nodeType}</span>
      </div>
      {data.moduleSlug && (
        <p className="mt-0.5 font-mono text-[11px] opacity-70">{data.moduleSlug}</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** The `nodeTypes` map for the map canvas: ordinary places (`map`) + region
 *  containers (`region`). Frozen at module scope per the React Flow recommendation,
 *  so the canvas doesn't rebuild it per render. */
export const mapNodeTypes = { map: MapNode, region: RegionNode } as const;

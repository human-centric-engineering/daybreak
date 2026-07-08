'use client';

/**
 * RegionNode (f-map-editor t-2b) — the custom `@xyflow` v12 group node that renders a
 * region container (F5). Members are true React Flow children (`parentId` +
 * `extent:'parent'`), so React Flow drags them with the region and confines them to
 * its box; this component only paints the frame + header and drives collapse/resize.
 *
 * - **Header**: a collapse/expand chevron + the region key + a `region` tag. The
 *   chevron calls back through `useMapEditor()` so `<MapBuilder>` can hide members and
 *   clear the saved flag.
 * - **Resize**: a `NodeResizer` (visible when selected + expanded) lets the author size
 *   the box; the new dimensions round-trip via `meta._size`.
 * - **Collapsed**: the box shrinks to the header and members are hidden (the parent
 *   owns that state); the frame drops its fill so it reads as a pill, not an empty box.
 */

import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMapEditor } from '@/components/admin/framework/map-builder/map-editor-context';
import { REGION_COLLAPSED_HEIGHT } from '@/components/admin/framework/map-builder/region-membership';
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

export function RegionNode({ id, data, selected }: NodeProps<MapFlowNode>) {
  const { onToggleCollapse } = useMapEditor();
  const collapsed = Boolean(data.collapsed);

  return (
    <div
      data-testid={`map-region-${id}`}
      data-node-key={data.label}
      data-collapsed={collapsed}
      className={cn(
        'flex h-full w-full flex-col rounded-lg border-2 transition-colors',
        collapsed
          ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20'
          : 'border-dashed border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/10',
        selected && 'ring-primary ring-2 ring-offset-1'
      )}
    >
      <NodeResizer
        isVisible={Boolean(selected) && !collapsed}
        minWidth={180}
        minHeight={REGION_COLLAPSED_HEIGHT + 60}
        lineClassName="!border-emerald-400"
        handleClassName="!h-2 !w-2 !rounded-sm !border-emerald-500 !bg-white dark:!bg-zinc-800"
      />

      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5 rounded-t-md bg-emerald-100/70 px-2 py-1.5 dark:bg-emerald-900/30">
        <button
          type="button"
          data-testid={`region-collapse-${id}`}
          aria-label={collapsed ? 'Expand region' : 'Collapse region'}
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(id);
          }}
          className="rounded p-0.5 text-emerald-700 hover:bg-emerald-200/60 dark:text-emerald-200 dark:hover:bg-emerald-800/50"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="flex-1 text-sm font-medium break-all text-emerald-900 dark:text-emerald-100">
          {data.label}
        </span>
        <span className="text-[10px] tracking-wide text-emerald-700/70 uppercase dark:text-emerald-300/70">
          region
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

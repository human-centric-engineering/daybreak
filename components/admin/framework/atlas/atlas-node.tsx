'use client';

/**
 * AtlasNode (f-atlas t-2a) — one read-only composition node, coloured by entity kind. Presentational:
 * the parent `<AtlasView>` owns all state and the click→navigate wiring; this only paints `data`.
 * A node with a deep-link (`data.href`) shows an affordance (an arrow + pointer cursor); a node with
 * none (slot / facilitation / an entity with no editor yet) reads as inert. Cribbed from the map
 * editor's `map-node.tsx`, minus the connect handles (the atlas draws no user edges).
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';
import { atlasNodeKind } from '@/components/admin/framework/atlas/atlas-node-kinds';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';

export function AtlasNode({ data, selected }: NodeProps<AtlasFlowNode>) {
  const kind = atlasNodeKind(data.kind);
  const Icon = kind.icon;
  const linkable = data.href !== null;

  return (
    <div
      data-testid={`atlas-node-${data.kind}`}
      data-dimmed={data.dimmed ? 'true' : undefined}
      className={cn(
        'max-w-56 min-w-36 rounded-md border-2 px-3 py-2 shadow-sm transition-all',
        kind.surface,
        linkable && 'cursor-pointer hover:shadow-md',
        selected && 'ring-primary shadow-md ring-2',
        // Lens (t-3): the focused subject gets a strong ring; everything outside the focused
        // subgraph fades so the connections stand out.
        data.focused && 'ring-primary shadow-md ring-2 ring-offset-1',
        data.dimmed && 'opacity-25'
      )}
    >
      {/* Handles are hidden (no user edges) but present so React Flow anchors edges to the node. */}
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div className="flex items-center gap-2">
        <span
          className={cn('flex h-6 w-6 items-center justify-center rounded', kind.iconChip)}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 truncate text-sm font-medium" title={data.label}>
          {data.label}
        </span>
        {linkable && <ExternalLink className="h-3 w-3 shrink-0 opacity-50" aria-hidden />}
      </div>
      {(data.sublabel || data.badge) && (
        <div className="mt-0.5 flex items-center gap-1.5 pl-8">
          {data.sublabel && (
            <span className="truncate font-mono text-[11px] opacity-70">{data.sublabel}</span>
          )}
          {data.badge && (
            <span className="rounded bg-black/5 px-1 text-[10px] tracking-wide uppercase opacity-70 dark:bg-white/10">
              {data.badge}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

/** The `nodeTypes` map for the atlas canvas (one custom type). Frozen at module scope per the React
 *  Flow recommendation, so the canvas doesn't rebuild it per render. */
export const atlasNodeTypes = { atlas: AtlasNode } as const;

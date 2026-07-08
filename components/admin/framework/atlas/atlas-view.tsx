'use client';

/**
 * AtlasView (f-atlas t-2a; semantic zoom t-2b) — the client shell around the composition canvas. Runs
 * the pure mapper over the projection the server page fetched, renders the canvas + a legend + the
 * detail toggle, and wires a node click to its deep-link (`router.push` to the real editor; a node
 * with no editor yet is inert). The atlas navigates, it never edits (X8) — there is no mutation path.
 *
 * Semantic zoom (t-2b): zoomed out shows only the primaries (modules / facilitation / maps) and their
 * map→module links; zoom in — or flip the "Show all detail" toggle — to unfold each primary's
 * satellites. `<AtlasGraph>` (inside the provider) reads the live zoom and applies it.
 *
 * Wrapped in `ReactFlowProvider` because the canvas uses React Flow hooks. Memoises the mapper so a
 * re-render (theme/toggle) doesn't relay out the graph.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import { Maximize2, Minimize2 } from 'lucide-react';

import { AtlasGraph } from '@/components/admin/framework/atlas/atlas-graph';
import {
  compositionToFlow,
  type AtlasFlowNode,
} from '@/components/admin/framework/atlas/atlas-mapper';
import {
  ATLAS_LEGEND_KINDS,
  atlasNodeKind,
} from '@/components/admin/framework/atlas/atlas-node-kinds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CompositionProjection } from '@/lib/framework/atlas/view';

export function AtlasView({ projection }: { projection: CompositionProjection }) {
  const router = useRouter();
  const [forceExpand, setForceExpand] = useState(false);
  const { nodes, edges } = useMemo(() => compositionToFlow(projection), [projection]);

  const handleNodeClick = useCallback(
    (node: AtlasFlowNode) => {
      if (node.data.href) router.push(node.data.href);
    },
    [router]
  );

  // Note: no empty state — the facilitation layer + the always-registered framework capabilities
  // mean the projection is never empty, so the canvas always has at least those nodes to draw.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setForceExpand((v) => !v)}
          aria-pressed={forceExpand}
        >
          {forceExpand ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" aria-hidden /> Auto (zoom to explore)
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Show all detail
            </>
          )}
        </Button>
      </div>
      <ReactFlowProvider>
        <AtlasGraph
          nodes={nodes}
          edges={edges}
          forceExpand={forceExpand}
          onNodeClick={handleNodeClick}
        />
      </ReactFlowProvider>
      <p className="text-muted-foreground text-xs">
        Read-only — click a node to open its editor; zoom in (or “Show all detail”) to unfold each
        node’s composition. The atlas navigates; it never edits.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Node kinds">
      {ATLAS_LEGEND_KINDS.map((type) => {
        const kind = atlasNodeKind(type);
        const Icon = kind.icon;
        return (
          <span key={type} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn('flex h-4 w-4 items-center justify-center rounded', kind.iconChip)}
              aria-hidden
            >
              <Icon className="h-2.5 w-2.5" />
            </span>
            {kind.label}
          </span>
        );
      })}
    </div>
  );
}

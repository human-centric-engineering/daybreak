'use client';

/**
 * AtlasView (f-atlas t-2a; semantic zoom t-2b; lenses t-3) — the client shell around the composition
 * canvas. Runs the pure mapper over the projection the server page fetched, renders the canvas + a
 * legend + the detail toggle + the lens selector, and wires a node click to its deep-link (`router.push`
 * to the real editor; a node with no editor is inert). The atlas navigates, it never edits (X8).
 *
 * Semantic zoom (t-2b): zoomed out shows only the primaries; zoom in — or "Show all detail" — to unfold
 * satellites. Lens (t-3): pick an entity to focus and the atlas highlights it plus everything it
 * connects to, dimming the rest ("where else is this agent used?"); a lens forces full detail so the
 * subject is never hidden by zoom. `<AtlasGraph>` (inside the provider) composes both.
 *
 * Wrapped in `ReactFlowProvider` because the canvas uses React Flow hooks. Memoises the mapper so a
 * re-render (theme/toggle/lens) doesn't relay out the graph.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import { Maximize2, Minimize2, X } from 'lucide-react';

import { AtlasGraph } from '@/components/admin/framework/atlas/atlas-graph';
import {
  compositionToFlow,
  type AtlasFlowNode,
} from '@/components/admin/framework/atlas/atlas-mapper';
import {
  ATLAS_LEGEND_KINDS,
  atlasNodeKind,
} from '@/components/admin/framework/atlas/atlas-node-kinds';
import { lensGroups } from '@/components/admin/framework/atlas/atlas-lens';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CompositionProjection } from '@/lib/framework/atlas/view';

export function AtlasView({ projection }: { projection: CompositionProjection }) {
  const router = useRouter();
  const [forceExpand, setForceExpand] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => compositionToFlow(projection), [projection]);
  const groups = useMemo(() => lensGroups(nodes), [nodes]);
  // A lens is only "effective" while its subject still exists. If the projection revalidates (a
  // router.refresh() re-renders this same instance) and the focused entity has since been deleted, a
  // stale `focusedId` would dim the WHOLE canvas with no subject to highlight — so ignore it until the
  // node reappears (or the user clears/re-picks). Everything downstream reads the effective value.
  const focusedNode = focusedId ? nodes.find((n) => n.id === focusedId) : undefined;
  const effectiveFocusedId = focusedNode ? focusedId : null;
  const focusedLabel = focusedNode?.data.label ?? null;

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
        <div className="flex items-center gap-2">
          <LensControl groups={groups} focusedId={effectiveFocusedId} onFocus={setFocusedId} />
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
      </div>

      {focusedLabel && (
        <p className="text-muted-foreground text-xs" role="status">
          Lens: highlighting <span className="text-foreground font-medium">{focusedLabel}</span> and
          everything it connects to.
        </p>
      )}

      <ReactFlowProvider>
        <AtlasGraph
          nodes={nodes}
          edges={edges}
          forceExpand={forceExpand}
          focusedId={effectiveFocusedId}
          onNodeClick={handleNodeClick}
        />
      </ReactFlowProvider>
      <p className="text-muted-foreground text-xs">
        Read-only — click a node to open its editor; zoom in (or “Show all detail”) to unfold each
        node’s composition; pick a lens to see where one entity is used. The atlas navigates; it
        never edits.
      </p>
    </div>
  );
}

function LensControl({
  groups,
  focusedId,
  onFocus,
}: {
  groups: ReturnType<typeof lensGroups>;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Select value={focusedId ?? ''} onValueChange={onFocus}>
        <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Lens — focus on an entity">
          <SelectValue placeholder="Lens: focus on…" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectGroup key={g.kind}>
              <SelectLabel>{atlasNodeKind(g.kind).label}</SelectLabel>
              {g.items.map((it) => (
                <SelectItem key={it.id} value={it.id}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {focusedId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onFocus(null)}
          aria-label="Clear lens"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
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

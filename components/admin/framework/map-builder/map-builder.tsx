'use client';

/**
 * MapBuilder (f-map-editor t-1) — the top-level client island the map editor page
 * mounts. Owns the canvas state (nodes / edges / selection) and the draft save flow;
 * a pattern-fork of the orchestration `WorkflowBuilder` shell, swapping its
 * workflow-bound leaves (step registry, block editors, cost/execution machinery) for
 * the map vocabulary.
 *
 * A map is always edited in place (it was created on the list page), so — unlike the
 * workflow builder — there is no create mode here: the canvas loads the in-progress
 * `draftDefinition` if present, else the published version's snapshot, else empty.
 * **Save** PATCHes the canvas to `draftDefinition` (`{ definition }`); **Discard**
 * PATCHes `{ definition: null }` and reloads from the published snapshot. Publish /
 * rollback / version history (t-4), the node inspector + validation (t-3), typed
 * edges + regions (t-2), and the dry-run (t-5) mount on this shell later.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Trash2 } from 'lucide-react';
import {
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnNodeDrag,
} from '@xyflow/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient, APIClientError } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import { mapDefinitionSchema, type EdgeType } from '@/lib/framework/facilitation/map/schema';

import { MapCanvas } from '@/components/admin/framework/map-builder/map-canvas';
import { MapPalette } from '@/components/admin/framework/map-builder/map-palette';
import { mapNodeKind } from '@/components/admin/framework/map-builder/map-node-kinds';
import { EdgeInspector } from '@/components/admin/framework/map-builder/edge-inspector';
import { makeMapEdge } from '@/components/admin/framework/map-builder/add-map-edge';
import { MapEditorProvider } from '@/components/admin/framework/map-builder/map-editor-context';
import {
  isDescendant,
  reparentNode,
  toggleRegionCollapse,
} from '@/components/admin/framework/map-builder/region-membership';
import {
  flowToMapDefinition,
  mapDefinitionToFlow,
  type MapFlowEdge,
  type MapFlowNode,
} from '@/components/admin/framework/map-builder/map-mappers';

/** The subset of the map-detail API row the editor needs. Fields serialise as JSON
 *  over the page fetch, so this is a plain structural shape, not the Prisma row. */
export interface MapEditorGraph {
  slug: string;
  name: string;
  description: string | null;
  draftDefinition: unknown;
  publishedVersion: { version: number; definition: unknown } | null;
}

/** Prefer the in-progress draft; fall back to the published snapshot; else nothing. */
function pickEditableDefinition(graph: MapEditorGraph): unknown {
  if (graph.draftDefinition !== null && graph.draftDefinition !== undefined) {
    return graph.draftDefinition;
  }
  return graph.publishedVersion?.definition ?? null;
}

function toFlow(definition: unknown): { nodes: MapFlowNode[]; edges: MapFlowEdge[] } {
  const parsed = mapDefinitionSchema.safeParse(definition);
  if (!parsed.success) return { nodes: [], edges: [] };
  return mapDefinitionToFlow(parsed.data);
}

/** Seed the canvas from the editable definition (draft-first, then published). */
function seedFlow(graph: MapEditorGraph): { nodes: MapFlowNode[]; edges: MapFlowEdge[] } {
  return toFlow(pickEditableDefinition(graph));
}

/** Seed the canvas from the published snapshot only (the discard fallback). */
function publishedFlow(graph: MapEditorGraph): {
  nodes: MapFlowNode[];
  edges: MapFlowEdge[];
} {
  return toFlow(graph.publishedVersion?.definition ?? null);
}

function mapPath(slug: string): string {
  return `/api/v1/admin/framework/maps/${encodeURIComponent(slug)}`;
}

function MapBuilderInner({ graph }: { graph: MapEditorGraph }) {
  const router = useRouter();
  const seed = useMemo(() => seedFlow(graph), [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<MapFlowNode>(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<MapFlowEdge>(seed.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState<boolean>(
    graph.draftDefinition !== null && graph.draftDefinition !== undefined
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of nodes) counts[node.data.nodeType] = (counts[node.data.nodeType] ?? 0) + 1;
    return counts;
  }, [nodes]);

  const handleNodeAdd = useCallback(
    (node: MapFlowNode) => {
      setNodes((prev) => [...prev, node]);
      setSaved(false);
    },
    [setNodes]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((prev) => {
        // Detaching a region: keep its direct members but pop them out to the top
        // level (at their absolute position) so they don't dangle on a removed parent.
        const childIds = prev.filter((n) => n.parentId === nodeId).map((n) => n.id);
        let next: MapFlowNode[] = prev;
        for (const childId of childIds) next = reparentNode(next, childId, null);
        return next.filter((n) => n.id !== nodeId);
      });
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
      setSaved(false);
    },
    [setEdges, setNodes]
  );

  // Region grouping: when a node drag ends, (un)group it based on which region it was
  // dropped into. Pick the deepest intersecting region (most specific), never the node
  // itself or a region nested under it (that would create a containment cycle).
  const { getIntersectingNodes } = useReactFlow<MapFlowNode>();
  const handleNodeDragStop = useCallback<OnNodeDrag<MapFlowNode>>(
    (_event, dragged) => {
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const depthOf = (id: string): number => {
        let d = 0;
        let cur = byId.get(id);
        const seen = new Set<string>();
        while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
          seen.add(cur.id);
          cur = byId.get(cur.parentId);
          d += 1;
        }
        return d;
      };
      const candidates = getIntersectingNodes(dragged).filter(
        (n) => n.type === 'region' && n.id !== dragged.id && !isDescendant(n.id, dragged.id, byId)
      );
      // Deepest (most-nested) region wins as the drop target.
      const target = candidates.reduce<string | null>(
        (best, n) => (best === null || depthOf(n.id) > depthOf(best) ? n.id : best),
        null
      );
      setNodes((prev) => reparentNode(prev, dragged.id, target));
      setSaved(false);
    },
    [getIntersectingNodes, nodes, setNodes]
  );

  const handleToggleCollapse = useCallback(
    (regionId: string) => {
      setNodes((prev) => toggleRegionCollapse(prev, regionId));
      setSaved(false);
    },
    [setNodes]
  );

  const editorContext = useMemo(
    () => ({ onToggleCollapse: handleToggleCollapse }),
    [handleToggleCollapse]
  );

  // Node and edge selection are mutually exclusive — a click on one clears the other,
  // so only one inspector shows at a time. A pane click (nodeId === null) clears both.
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }, []);

  const handleEdgeSelect = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  }, []);

  // Drawing a connection materialises a default typed edge (decision 6:
  // draw-then-inspect — the author retypes it in the edge inspector). We dedupe on
  // source+target+*type* (not xyflow's `addEdge`, which ignores type) so the schema's
  // allowance of several differently-typed edges between the same pair is drawable —
  // while still blocking an exact-duplicate connection.
  const handleConnect = useCallback(
    (connection: Connection) => {
      const edge = makeMapEdge(connection);
      if (!edge) return;
      setEdges((prev) => {
        const dup = prev.some(
          (e) =>
            e.source === edge.source &&
            e.target === edge.target &&
            e.data?.edgeType === edge.data?.edgeType
        );
        return dup ? prev : [...prev, edge];
      });
      setSaved(false);
    },
    [setEdges]
  );

  const handleEdgeTypeChange = useCallback(
    (edgeId: string, type: EdgeType) => {
      setEdges((prev) =>
        prev.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, edgeType: type } } : e))
      );
      setSaved(false);
    },
    [setEdges]
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
      setSelectedEdgeId(null);
      setSaved(false);
    },
    [setEdges]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const definition = flowToMapDefinition(nodes, edges);
      await apiClient.patch(mapPath(graph.slug), { body: { definition } });
      setHasDraft(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof APIClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save the draft';
      setSaveError(message);
      logger.error('Map draft save failed', { slug: graph.slug, error: message });
    } finally {
      setSaving(false);
    }
  }, [edges, graph.slug, nodes, router]);

  const handleDiscard = useCallback(async () => {
    if (!window.confirm('Discard the in-progress draft? The published version is unchanged.')) {
      return;
    }
    setSaveError(null);
    try {
      await apiClient.patch(mapPath(graph.slug), { body: { definition: null } });
      // Reset the canvas to the published snapshot the discard fell back to, read
      // from the props already in hand (no publish happens in the editor, so it is
      // still current). Doing this without a second request keeps discard atomic:
      // the canvas can't be left showing the just-discarded draft if a reload fails.
      const published = publishedFlow(graph);
      setNodes(published.nodes);
      setEdges(published.edges);
      setSelectedNodeId(null);
      setSaved(false);
      setHasDraft(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof APIClientError ? err.message : 'Failed to discard the draft';
      setSaveError(message);
      logger.error('Map draft discard failed', { slug: graph.slug, error: message });
    }
  }, [graph, router, setEdges, setNodes]);

  // Clear the transient "Saved" indicator as soon as the canvas is actually edited
  // (a node moved, resized, or removed) — not on a mere selection — so it never claims
  // an unsaved change is persisted.
  const handleNodesChange = useCallback<typeof onNodesChange>(
    (changes) => {
      if (
        changes.some((c) => c.type === 'position' || c.type === 'remove' || c.type === 'dimensions')
      )
        setSaved(false);
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const statusPill =
    graph.publishedVersion === null
      ? { label: 'Unpublished', variant: 'outline' as const }
      : hasDraft
        ? {
            label: `Published v${graph.publishedVersion.version} · editing draft`,
            variant: 'secondary' as const,
          }
        : { label: `Published v${graph.publishedVersion.version}`, variant: 'outline' as const };

  return (
    <MapEditorProvider value={editorContext}>
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold">{graph.name}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {graph.slug}
            </Badge>
            <Badge variant={statusPill.variant} className="text-xs">
              {statusPill.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDiscard()}
              disabled={!hasDraft}
            >
              Discard draft
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
          </div>
        </header>

        {saveError && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="h-4 w-4" />
            <span>{saveError}</span>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <MapPalette typeCounts={typeCounts} />
          <MapCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={handleNodeSelect}
            onEdgeClick={handleEdgeSelect}
            onNodeAdd={handleNodeAdd}
          />
          {selectedNode ? (
            <SelectedNodePanel node={selectedNode} onDelete={handleNodeDelete} />
          ) : selectedEdge ? (
            <EdgeInspector
              edge={selectedEdge}
              onTypeChange={handleEdgeTypeChange}
              onDelete={handleEdgeDelete}
            />
          ) : null}
        </div>
      </div>
    </MapEditorProvider>
  );
}

/**
 * The minimal selected-node aside t-1 ships: the node's identity + a Delete action.
 * t-3 grows this into the full config inspector (module binding, first-arrival,
 * completion mode, condition builder); keeping it read-only here means the delete
 * path is discoverable without pre-building that surface.
 */
function SelectedNodePanel({
  node,
  onDelete,
}: {
  node: MapFlowNode;
  onDelete: (nodeId: string) => void;
}) {
  const kind = mapNodeKind(node.data.nodeType);
  return (
    <aside
      data-testid="map-node-panel"
      className="bg-background flex h-full w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4"
    >
      <div>
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          {kind.label}
        </p>
        <p className="mt-0.5 text-sm font-medium break-all">{node.data.label}</p>
      </div>
      {node.data.moduleSlug && (
        <div>
          <p className="text-muted-foreground text-xs">Module binding</p>
          <p className="font-mono text-sm break-all">{node.data.moduleSlug}</p>
        </div>
      )}
      <p className="text-muted-foreground text-xs leading-relaxed">
        Full node configuration (module binding, gating, completion) arrives in a later task. For
        now you can reposition and delete nodes and save the draft.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-auto text-red-600 hover:text-red-700 dark:text-red-400"
        onClick={() => onDelete(node.id)}
      >
        <Trash2 className="mr-1.5 h-4 w-4" /> Delete node
      </Button>
    </aside>
  );
}

export function MapBuilder({ graph }: { graph: MapEditorGraph }) {
  // React Flow requires a provider wrapper for `useReactFlow` (canvas drop positioning).
  return (
    <ReactFlowProvider>
      <MapBuilderInner graph={graph} />
    </ReactFlowProvider>
  );
}

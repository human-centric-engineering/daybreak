/**
 * Cross-cutting lens logic for the atlas (f-atlas t-3) — pure TS (types-only `@xyflow` import), so it
 * unit-tests without a DOM.
 *
 * A lens **inverts** the view: pick one entity and the atlas highlights it plus everything directly
 * connected to it, dimming the rest — answering "where else is this agent used?", "who can write this
 * slot?", "what does this module consist of?" at a glance instead of across four admin pages (§5.6).
 * `applyFocus` sets a `dimmed`/`focused` flag on nodes and an opacity on edges; it never removes or
 * re-lays-out anything, so clearing the lens is instant.
 */

import type { Edge } from '@xyflow/react';

import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';
import { ATLAS_LEGEND_KINDS } from '@/components/admin/framework/atlas/atlas-node-kinds';
import type { AtlasEntityType } from '@/lib/framework/atlas/view';

/** Opacity applied to nodes/edges outside the focused subgraph. */
const DIMMED_OPACITY = 0.12;

/**
 * The node ids in focus: the focused node plus its **direct** neighbours (one hop over any edge). A
 * neighbour is lit so you can read what the focused entity connects to; nodes two hops away are dimmed.
 */
export function focusSet(edges: readonly Edge[], focusedId: string): Set<string> {
  const set = new Set<string>([focusedId]);
  for (const e of edges) {
    if (e.source === focusedId) set.add(e.target);
    else if (e.target === focusedId) set.add(e.source);
  }
  return set;
}

/**
 * Apply (or clear) a lens. With `focusedId === null` every node/edge is reset to un-dimmed. With an id,
 * nodes not in the {@link focusSet} are `dimmed` (the focused one flagged `focused`), and every edge not
 * touching the focused node is faded — so only the focused entity's own connections stay lit. Preserves
 * each node/edge's other flags (e.g. the semantic-zoom `hidden`); returns new objects (no mutation).
 */
export function applyFocus(
  nodes: readonly AtlasFlowNode[],
  edges: readonly Edge[],
  focusedId: string | null
): { nodes: AtlasFlowNode[]; edges: Edge[] } {
  if (focusedId === null) {
    return {
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data, dimmed: false, focused: false } })),
      edges: edges.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } })),
    };
  }

  const focus = focusSet(edges, focusedId);
  return {
    nodes: nodes.map((n) => ({
      ...n,
      data: { ...n.data, dimmed: !focus.has(n.id), focused: n.id === focusedId },
    })),
    edges: edges.map((e) => {
      const lit = e.source === focusedId || e.target === focusedId;
      return { ...e, style: { ...e.style, opacity: lit ? 1 : DIMMED_OPACITY } };
    }),
  };
}

/** One lensable entity for the selector: its canvas node id + display label. Module-local — the view
 *  consumes the shape via `ReturnType<typeof lensGroups>`, so neither interface needs to be exported. */
interface LensOption {
  id: string;
  label: string;
}

/** A group of lensable entities of one kind, for the grouped selector. */
interface LensGroup {
  kind: AtlasEntityType;
  items: LensOption[];
}

/**
 * Group the nodes by kind (in legend order) for the lens selector — every node is focusable, so any
 * entity can be the lens subject. Empty groups are omitted. Deterministic (legend order → node order).
 */
export function lensGroups(nodes: readonly AtlasFlowNode[]): LensGroup[] {
  return ATLAS_LEGEND_KINDS.map((kind) => ({
    kind,
    items: nodes
      .filter((n) => n.data.kind === kind)
      .map((n) => ({ id: n.id, label: n.data.label })),
  })).filter((g) => g.items.length > 0);
}

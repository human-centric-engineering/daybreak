/**
 * Pure mappers between a published facilitation map + a user's journey state and
 * the React Flow `nodes`/`edges` the read-only explorer canvas renders (f-ops-views
 * t-5b). The journey analogue of `workflow-mappers.ts`: intentionally free of React
 * / React Flow *runtime* imports (types only) so the layout, the status overlay, and
 * the replay reducer unit-test without a DOM or library setup.
 *
 * Maps carry no authored x/y (unlike workflows), so {@link layoutJourney} computes a
 * left-to-right layered layout: a node sits one column right of its deepest
 * *structural* predecessor (`prerequisite`/`unlocks` edges, which read `from → to`;
 * `tangent`/`related_to` are advisory and don't drive layout). The node's colour is
 * its journey status — either the live `UserNodeState` projection ({@link liveStatuses})
 * or, during replay, the status reconstructed from the event log up to a scrubber
 * index ({@link replayStatuses}).
 */

import type { Edge, Node } from '@xyflow/react';
import type { MapDefinition, NodeType } from '@/lib/framework/facilitation/map/schema';
import {
  JOURNEY_EVENT_TYPE,
  NODE_STATE_STATUS,
} from '@/lib/framework/facilitation/journey/vocabulary';
import type {
  JourneyNodeStateView,
  JourneyEventView,
} from '@/lib/framework/facilitation/journey/view';

/** The structural edge types that drive the layered layout (`from` precedes `to`). */
const FORWARD_EDGE_TYPES = new Set(['prerequisite', 'unlocks']);
/** Advisory edge types — rendered dashed, excluded from layout. */
const ADVISORY_EDGE_TYPES = new Set(['tangent', 'related_to']);

const X_STEP = 240;
const Y_STEP = 110;

/** The data payload the custom journey node renders. */
export interface JourneyNodeData extends Record<string, unknown> {
  /** The node key (its stable map identity, shown as the label). */
  label: string;
  nodeType: NodeType;
  /** Bound module slug for `module` nodes. */
  moduleSlug?: string;
  /** The journey status colouring the node (free-form/X1; unknowns render neutral). */
  status: string;
  /** The node the replay scrubber is currently on (a highlight ring). */
  isCurrent: boolean;
}

export type JourneyFlowNode = Node<JourneyNodeData, 'journey'>;

/** A laid-out node before its (mode-dependent) status is applied. */
export interface JourneyBaseNode {
  key: string;
  nodeType: NodeType;
  moduleSlug?: string;
  position: { x: number; y: number };
}

/**
 * The stable, structure-derived layout: one base node per map node (positioned by
 * longest-path layering over the structural edges) plus the full edge set (advisory
 * edges dashed). Depends only on the map, so the explorer memoises it and re-applies
 * cheap status overlays on top as the mode / scrubber changes.
 */
export function layoutJourney(structure: MapDefinition): {
  baseNodes: JourneyBaseNode[];
  edges: Edge[];
} {
  const byKey = new Map(structure.nodes.map((n) => [n.key, n]));

  // Structural edges whose endpoints both exist drive the layering.
  const forward = structure.edges.filter(
    (e) => FORWARD_EDGE_TYPES.has(e.type) && byKey.has(e.from) && byKey.has(e.to)
  );
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>(structure.nodes.map((n) => [n.key, 0]));
  for (const e of forward) {
    const out = adjacency.get(e.from) ?? [];
    out.push(e.to);
    adjacency.set(e.from, out);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  // Longest-path layering via Kahn's topological order: a node lands one column
  // right of its deepest predecessor, so every prerequisite sits left of what it
  // gates. Nodes left unassigned (a would-be cycle in a malformed map) default to 0.
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const n of structure.nodes) {
    if ((indegree.get(n.key) ?? 0) === 0) {
      level.set(n.key, 0);
      queue.push(n.key);
    }
  }
  while (queue.length > 0) {
    const u = queue.shift()!;
    const uLevel = level.get(u) ?? 0;
    for (const v of adjacency.get(u) ?? []) {
      level.set(v, Math.max(level.get(v) ?? 0, uLevel + 1));
      const remaining = (indegree.get(v) ?? 0) - 1;
      indegree.set(v, remaining);
      if (remaining === 0) queue.push(v);
    }
  }

  // Stack nodes within their column by first-seen (array) order for a stable layout.
  const rowInLevel = new Map<number, number>();
  const baseNodes: JourneyBaseNode[] = structure.nodes.map((n) => {
    const col = level.get(n.key) ?? 0;
    const row = rowInLevel.get(col) ?? 0;
    rowInLevel.set(col, row + 1);
    return {
      key: n.key,
      nodeType: n.type,
      ...(n.moduleSlug ? { moduleSlug: n.moduleSlug } : {}),
      position: { x: col * X_STEP, y: row * Y_STEP },
    };
  });

  const edges: Edge[] = structure.edges
    .filter((e) => byKey.has(e.from) && byKey.has(e.to))
    .map((e, i) => ({
      id: `${e.from}__${e.to}__${e.type}__${i}`,
      source: e.from,
      target: e.to,
      ...(ADVISORY_EDGE_TYPES.has(e.type)
        ? { style: { strokeDasharray: '4 4', stroke: '#a1a1aa' }, label: e.type }
        : {}),
    }));

  return { baseNodes, edges };
}

/** Merge base nodes with a status map (+ the current replay node) into flow nodes. */
export function toFlowNodes(
  baseNodes: JourneyBaseNode[],
  statusByNode: Map<string, string>,
  currentNodeKey: string | null = null
): JourneyFlowNode[] {
  return baseNodes.map((n) => ({
    id: n.key,
    type: 'journey',
    position: n.position,
    data: {
      label: n.key,
      nodeType: n.nodeType,
      ...(n.moduleSlug ? { moduleSlug: n.moduleSlug } : {}),
      status: statusByNode.get(n.key) ?? NODE_STATE_STATUS.unvisited,
      isCurrent: n.key === currentNodeKey,
    },
  }));
}

/** The live overlay: each node's current `UserNodeState.status`, keyed by node. */
export function liveStatuses(nodeStates: JourneyNodeStateView[]): Map<string, string> {
  return new Map(nodeStates.map((s) => [s.nodeKey, s.status]));
}

/**
 * The replay overlay: the status of each node reconstructed from the event log up to
 * (and including) `uptoIndex`. A node is `completed` if it has a `node_completed`
 * event by then; else `active` if it is the node the scrubber is on; else `visited`
 * if it was ever entered; else `unvisited`. `currentNodeKey` is the scrubbed event's
 * node (a highlight ring), independent of colour.
 */
export function replayStatuses(
  timeline: JourneyEventView[],
  uptoIndex: number
): { statusByNode: Map<string, string>; currentNodeKey: string | null } {
  const entered = new Set<string>();
  const completed = new Set<string>();
  const last = Math.min(uptoIndex, timeline.length - 1);
  for (let i = 0; i <= last; i++) {
    const e = timeline[i];
    if (!e.nodeKey) continue;
    if (e.type === JOURNEY_EVENT_TYPE.nodeCompleted) completed.add(e.nodeKey);
    else if (e.type === JOURNEY_EVENT_TYPE.nodeEntered) entered.add(e.nodeKey);
  }
  const currentNodeKey = last >= 0 ? (timeline[last]?.nodeKey ?? null) : null;

  const statusByNode = new Map<string, string>();
  for (const k of entered) {
    statusByNode.set(
      k,
      k === currentNodeKey ? NODE_STATE_STATUS.active : NODE_STATE_STATUS.visited
    );
  }
  // A completion outranks entered/active.
  for (const k of completed) statusByNode.set(k, NODE_STATE_STATUS.completed);
  // The scrubbed node reads active unless it was completed at this step.
  if (currentNodeKey && !completed.has(currentNodeKey)) {
    statusByNode.set(currentNodeKey, NODE_STATE_STATUS.active);
  }
  return { statusByNode, currentNodeKey };
}

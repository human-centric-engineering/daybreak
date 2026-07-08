/**
 * Region containers — the pure graph helpers behind `@xyflow` v12 parent/child region
 * grouping (f-map-editor t-2b). No React / React Flow *runtime* imports (types only),
 * so the reparent maths, collapse/hidden propagation, and absolute↔relative position
 * conversion all unit-test without a DOM.
 *
 * A region is a `type:'region'` node rendered as a group container; a member carries
 * React Flow `parentId = <regionId>` + `extent:'parent'` and a position **relative to
 * that parent**. The map schema stores membership as `node.region` and every node's
 * **absolute** canvas position in `meta._layout`, so the mapper converts between the
 * two using these helpers; the builder uses them for drag-to-group + collapse.
 */

import type { XYPosition } from '@xyflow/react';
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

// ─── Reserved `meta` keys (UI metadata; re-derived, never authored) ──────────
export const LAYOUT_KEY = '_layout';
export const SIZE_KEY = '_size';
export const COLLAPSED_KEY = '_collapsed';
const RESERVED_KEYS = [LAYOUT_KEY, SIZE_KEY, COLLAPSED_KEY];

/** Default region box dimensions for a freshly-dropped region. */
export const REGION_DEFAULT_SIZE = { width: 320, height: 220 };
/** The height a region collapses to — just its header. */
export const REGION_COLLAPSED_HEIGHT = 46;

export interface StoredSize {
  width: number;
  height: number;
}

/** Read `{ x, y }` from a node's `meta._layout`, or null if absent/malformed. */
export function readLayout(meta: Record<string, unknown> | undefined): XYPosition | null {
  const raw = meta?.[LAYOUT_KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return null;
  return { x: obj.x, y: obj.y };
}

/** Read `{ width, height }` from a region's `meta._size`, or null if absent/malformed. */
export function readSize(meta: Record<string, unknown> | undefined): StoredSize | null {
  const raw = meta?.[SIZE_KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.width !== 'number' || typeof obj.height !== 'number') return null;
  return { width: obj.width, height: obj.height };
}

/** Whether a region's `meta._collapsed` marks it collapsed. */
export function readCollapsed(meta: Record<string, unknown> | undefined): boolean {
  return meta?.[COLLAPSED_KEY] === true;
}

/**
 * Strip every reserved UI key from a `meta` bag so it never reaches the node data
 * payload (position/size/collapse are re-derived from the flow node). Returns
 * `undefined` when nothing authored is left, so an unadorned node stays clean.
 */
export function stripReserved(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const hasReserved = RESERVED_KEYS.some((k) => k in meta);
  if (!hasReserved) return Object.keys(meta).length > 0 ? meta : undefined;
  const copy = { ...meta };
  for (const k of RESERVED_KEYS) delete copy[k];
  return Object.keys(copy).length > 0 ? copy : undefined;
}

// ─── Flow-graph helpers (operate on the React Flow node array) ────────────────

function indexById(nodes: readonly MapFlowNode[]): Map<string, MapFlowNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/**
 * A flow node's absolute canvas position: its own position plus every ancestor
 * parent's, walked up the `parentId` chain (React Flow stores a child's position
 * relative to its parent). Memoised; cycle-safe.
 */
export function absoluteFlowPosition(
  node: MapFlowNode,
  byId: Map<string, MapFlowNode>,
  memo: Map<string, XYPosition> = new Map()
): XYPosition {
  const cached = memo.get(node.id);
  if (cached) return cached;
  const parent = node.parentId ? byId.get(node.parentId) : undefined;
  const abs =
    parent && parent.id !== node.id
      ? (() => {
          const p = absoluteFlowPosition(parent, byId, memo);
          return { x: node.position.x + p.x, y: node.position.y + p.y };
        })()
      : { x: node.position.x, y: node.position.y };
  memo.set(node.id, abs);
  return abs;
}

/** Order nodes so every parent precedes its children (React Flow requires this). */
export function sortParentsFirst(nodes: readonly MapFlowNode[]): MapFlowNode[] {
  const byId = indexById(nodes);
  const depth = (n: MapFlowNode): number => {
    let d = 0;
    let cur: MapFlowNode | undefined = n;
    const seen = new Set<string>();
    while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      d += 1;
    }
    return d;
  };
  return [...nodes].sort((a, b) => depth(a) - depth(b));
}

/** Is `candidateId` somewhere beneath `ancestorId` in the region tree? */
export function isDescendant(
  candidateId: string,
  ancestorId: string,
  byId: Map<string, MapFlowNode>
): boolean {
  let cur = byId.get(candidateId);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

/** Every node whose ancestor chain includes `regionId`. */
export function descendantIds(regionId: string, nodes: readonly MapFlowNode[]): Set<string> {
  const byId = indexById(nodes);
  const out = new Set<string>();
  for (const n of nodes) {
    let cur = n.parentId ? byId.get(n.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.id === regionId) {
        out.add(n.id);
        break;
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return out;
}

/** Set each node's `hidden` from whether any ancestor region is collapsed. Returns a
 *  new array, reusing node references that don't change so React Flow doesn't churn. */
export function recomputeHidden(nodes: readonly MapFlowNode[]): MapFlowNode[] {
  const byId = indexById(nodes);
  const ancestorCollapsed = (n: MapFlowNode): boolean => {
    let cur = n.parentId ? byId.get(n.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.data.collapsed) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  return nodes.map((n) => {
    const hidden = ancestorCollapsed(n);
    return Boolean(n.hidden) === hidden ? n : { ...n, hidden };
  });
}

/**
 * Move `nodeId` into `newParentId` (or out of any region when `null`), converting its
 * position between coordinate spaces so it doesn't visually jump. Keeps `data.region`
 * in sync with `parentId` and re-sorts parents-first. A no-op if the parent is
 * unchanged.
 */
export function reparentNode(
  nodes: readonly MapFlowNode[],
  nodeId: string,
  newParentId: string | null
): MapFlowNode[] {
  const byId = indexById(nodes);
  const node = byId.get(nodeId);
  if (!node) return nodes as MapFlowNode[];
  if ((node.parentId ?? null) === newParentId) return nodes as MapFlowNode[];

  const abs = absoluteFlowPosition(node, byId);
  const parent = newParentId ? byId.get(newParentId) : undefined;
  const parentAbs = parent ? absoluteFlowPosition(parent, byId) : { x: 0, y: 0 };
  const position = { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y };

  const updated = nodes.map((n) =>
    n.id === nodeId
      ? {
          ...n,
          position,
          parentId: newParentId ?? undefined,
          extent: newParentId ? ('parent' as const) : undefined,
          data: { ...n.data, region: newParentId ?? undefined },
        }
      : n
  );
  return sortParentsFirst(updated);
}

/**
 * Toggle a region's collapsed state: swap its height between the collapsed header
 * height and its remembered expanded height, then re-propagate `hidden` to members.
 */
export function toggleRegionCollapse(
  nodes: readonly MapFlowNode[],
  regionId: string
): MapFlowNode[] {
  const region = nodes.find((n) => n.id === regionId);
  if (!region) return nodes as MapFlowNode[];
  const collapsing = !region.data.collapsed;
  const next = nodes.map((n) => {
    if (n.id !== regionId) return n;
    const expandedHeight =
      (typeof n.data.expandedHeight === 'number' ? n.data.expandedHeight : undefined) ??
      n.height ??
      REGION_DEFAULT_SIZE.height;
    return {
      ...n,
      height: collapsing ? REGION_COLLAPSED_HEIGHT : expandedHeight,
      data: {
        ...n.data,
        collapsed: collapsing,
        // Remember the height we're collapsing away from, so expand restores it.
        expandedHeight: collapsing ? (n.height ?? expandedHeight) : expandedHeight,
      },
    };
  });
  return recomputeHidden(next);
}

/**
 * GraphStore — topology over an authored facilitation map (f-engine t-1).
 *
 * The engine (spec §5.3) reads the published map through a **`GraphStore`
 * interface** (F8): "Postgres now, a graph DB is a later swap, not a rewrite." The
 * shipped `getPublishedMap` already materialises the whole bounded map
 * (`MapDefinition` — ≤ low-hundreds of nodes, F8's own sizing) into memory, so this
 * first impl runs reachability / neighbours / paths as plain graph algorithms over
 * that loaded definition — still Postgres-backed (the map lives in Postgres; no
 * second datastore), but pure and dependency-free. Pushing traversal into recursive
 * SQL earns its cost only when collective-journey analytics demand deep in-DB
 * pathfinding at scale (F8's "later" trigger); that is a swap behind this interface,
 * not a rewrite of its callers (see `.context/framework/planning/f-engine.md`,
 * decision 1).
 *
 * This module is **pure** — it imports only map/scope types, never `@/lib/db/*` —
 * so its unit tests need no DB. The DB-bound loader that binds a store to a slug's
 * published version, `getPublishedGraph`, lives in `published-graph.ts` (the
 * schema-vs-version-service split f-map uses); per B12, pure tests import this
 * module, not the engine barrel.
 *
 * t-1 ships topology only. Availability computation (`computeAvailability`, t-2)
 * and publish-invariant validation (t-4) build on the primitives here — `t-4`
 * reuses {@link GraphStore.findCycles} (prerequisite cycles) and
 * {@link GraphStore.reachableFrom} (unreachable-required). Edge *semantics* (F3:
 * prerequisite=all, unlocks=any, …) belong to those consumers; this layer is a pure
 * directed multigraph over authored edges (F9 — pgvector similarity is never a
 * topology input).
 */

import type {
  MapDefinition,
  MapNode,
  MapEdge,
  EdgeType,
} from '@/lib/framework/facilitation/map/schema';
import type { NodeKey } from '@/lib/framework/shared/scope';

/** Follow edges outgoing from a node (`out`, the default) or incoming to it (`in`). */
export type EdgeDirection = 'out' | 'in';

/** Constrains which edges a traversal follows. */
export interface TraversalOptions {
  /** Restrict to these edge types (F3). Omitted ⇒ all four types. An empty array
   *  matches nothing (an explicit "no edges"), not "all" — callers pass `undefined`
   *  for the all-types default. */
  edgeTypes?: readonly EdgeType[];
  /** Traverse via outgoing edges (`out`, default) or incoming (`in`). Ignored by
   *  {@link GraphStore.findCycles}, which always follows outgoing edges. */
  direction?: EdgeDirection;
}

/**
 * Read-only topology over one published map. All traversal is over the authored
 * directed multigraph; queries on an absent node key return empty, never throw
 * (dangling references are `validate.ts`'s concern, caught at publish).
 */
export interface GraphStore {
  /** Every node, in authored order. */
  nodes(): readonly MapNode[];
  /** Every edge, in authored order. */
  edges(): readonly MapEdge[];
  /** The node for `key`, or `undefined` if none. */
  node(key: NodeKey): MapNode | undefined;
  /** The edges adjacent to `key` in the requested direction + types (the edges
   *  themselves, so callers see edge `type`/`condition`). */
  neighbours(key: NodeKey, options?: TraversalOptions): readonly MapEdge[];
  /** Every node reachable from `key` by following ≥1 edge (per options). Excludes
   *  `key` unless a cycle leads back to it. */
  reachableFrom(key: NodeKey, options?: TraversalOptions): ReadonlySet<NodeKey>;
  /** Every simple path (no repeated node) from `from` to `to` as a node-key
   *  sequence including both endpoints; `[[from]]` when `from === to`; `[]` if
   *  either endpoint is absent or no path exists. */
  pathsBetween(from: NodeKey, to: NodeKey, options?: TraversalOptions): readonly NodeKey[][];
  /** Distinct cycles among edges of the given type(s), each as the node-key loop
   *  (closing edge implicit); `[]` if acyclic. Always follows outgoing edges. t-4
   *  uses this over `['prerequisite']` for the no-prerequisite-cycles invariant. */
  findCycles(options?: Pick<TraversalOptions, 'edgeTypes'>): readonly NodeKey[][];
  /** The key of the region node containing `key` (its `region` field), or
   *  `undefined`. First-class regions, F5. */
  regionOf(key: NodeKey): NodeKey | undefined;
  /** Every node whose containing region is `regionKey`, in authored order. F5. */
  nodesInRegion(regionKey: NodeKey): readonly MapNode[];
}

/**
 * Build an in-memory {@link GraphStore} over a parsed map definition. Adjacency and
 * region indices are computed once here; every query reads them. The definition is
 * treated as immutable — the store never mutates it and returns only copies of its
 * internal sets/arrays' *references* to the caller-facing `readonly` shapes.
 */
export function inMemoryGraphStore(definition: MapDefinition): GraphStore {
  const nodeByKey = new Map<NodeKey, MapNode>();
  for (const node of definition.nodes) nodeByKey.set(node.key, node);

  const outgoing = new Map<NodeKey, MapEdge[]>();
  const incoming = new Map<NodeKey, MapEdge[]>();
  for (const edge of definition.edges) {
    appendTo(outgoing, edge.from, edge);
    appendTo(incoming, edge.to, edge);
  }

  const byRegion = new Map<NodeKey, MapNode[]>();
  for (const node of definition.nodes) {
    if (node.region !== undefined) appendTo(byRegion, node.region, node);
  }

  /** The adjacent edges of `key` in the requested direction, filtered by type. */
  function adjacentEdges(key: NodeKey, options?: TraversalOptions): MapEdge[] {
    const direction = options?.direction ?? 'out';
    const edges = (direction === 'out' ? outgoing.get(key) : incoming.get(key)) ?? [];
    const types = options?.edgeTypes;
    return types ? edges.filter((e) => types.includes(e.type)) : edges;
  }

  /** The node at the far end of `edge` from `key`, given traversal direction. */
  function endpoint(edge: MapEdge, direction: EdgeDirection): NodeKey {
    return direction === 'out' ? edge.to : edge.from;
  }

  function reachableFrom(key: NodeKey, options?: TraversalOptions): ReadonlySet<NodeKey> {
    const direction = options?.direction ?? 'out';
    const reached = new Set<NodeKey>();
    if (!nodeByKey.has(key)) return reached;
    const queue: NodeKey[] = [key];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of adjacentEdges(current, options)) {
        const next = endpoint(edge, direction);
        // Dangling endpoints (validate.ts's concern) are skipped, not traversed.
        if (!nodeByKey.has(next) || reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    return reached;
  }

  function pathsBetween(
    from: NodeKey,
    to: NodeKey,
    options?: TraversalOptions
  ): readonly NodeKey[][] {
    if (!nodeByKey.has(from) || !nodeByKey.has(to)) return [];
    if (from === to) return [[from]];
    const direction = options?.direction ?? 'out';
    const paths: NodeKey[][] = [];
    const path: NodeKey[] = [from];
    const onPath = new Set<NodeKey>([from]);
    const visit = (current: NodeKey): void => {
      for (const edge of adjacentEdges(current, options)) {
        const next = endpoint(edge, direction);
        if (!nodeByKey.has(next) || onPath.has(next)) continue;
        path.push(next);
        onPath.add(next);
        if (next === to) paths.push([...path]);
        else visit(next);
        path.pop();
        onPath.delete(next);
      }
    };
    visit(from);
    return paths;
  }

  function findCycles(options?: Pick<TraversalOptions, 'edgeTypes'>): readonly NodeKey[][] {
    const cycles: NodeKey[][] = [];
    const seen = new Set<string>();
    // 0 = unvisited, 1 = on the current DFS stack (gray), 2 = done (black).
    const colour = new Map<NodeKey, 0 | 1 | 2>();
    const stack: NodeKey[] = [];
    const visit = (node: NodeKey): void => {
      colour.set(node, 1);
      stack.push(node);
      for (const edge of adjacentEdges(node, { edgeTypes: options?.edgeTypes, direction: 'out' })) {
        const next = edge.to;
        if (!nodeByKey.has(next)) continue;
        const state = colour.get(next) ?? 0;
        if (state === 1) {
          // Back-edge onto the current stack: the loop is stack[from next .. node].
          const loop = stack.slice(stack.indexOf(next));
          const canonical = canonicaliseCycle(loop);
          if (!seen.has(canonical)) {
            seen.add(canonical);
            cycles.push(loop);
          }
        } else if (state === 0) {
          visit(next);
        }
      }
      stack.pop();
      colour.set(node, 2);
    };
    for (const key of nodeByKey.keys()) {
      if ((colour.get(key) ?? 0) === 0) visit(key);
    }
    return cycles;
  }

  return {
    nodes: () => definition.nodes,
    edges: () => definition.edges,
    node: (key) => nodeByKey.get(key),
    neighbours: (key, options) => adjacentEdges(key, options),
    reachableFrom,
    pathsBetween,
    findCycles,
    regionOf: (key) => nodeByKey.get(key)?.region,
    nodesInRegion: (regionKey) => byRegion.get(regionKey) ?? [],
  };
}

/** Append `value` to the list at `key`, creating the list on first use. */
function appendTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Canonical string for a cycle so the same loop found from different entry points
 * dedupes to one: rotate the node-key sequence to start at its smallest member.
 * (Two rotations of the same directed cycle share this form; a reversed traversal
 * can't occur here — `findCycles` only follows outgoing edges.)
 */
function canonicaliseCycle(loop: readonly NodeKey[]): string {
  let minIndex = 0;
  for (let i = 1; i < loop.length; i++) {
    if (loop[i] < loop[minIndex]) minIndex = i;
  }
  return [...loop.slice(minIndex), ...loop.slice(0, minIndex)].join(' ');
}

/**
 * Publish-time graph invariants (f-engine t-4) — the **conditional** invariants only
 * the engine can decide, appended to the map's publish chain (spec §5.3, §5.5).
 *
 * `validateMapFormat` (map/validate.ts) already does the STATIC structural checks
 * (duplicate keys, dangling endpoints, region-containment cycles). This adds the
 * checks that need graph traversal over the *typed* edges:
 * - **prerequisite-edge cycles** — a cycle among `prerequisite` edges is an
 *   unsatisfiable deadlock (each node in the loop waits on the next). Reuses t-1's
 *   {@link GraphStore.findCycles} over `['prerequisite']`.
 * - **unreachable nodes** — a node no walker can ever reach: not reachable from any
 *   *root* (a node with no incoming `prerequisite`/`unlocks` gate) by following the
 *   progression edges (`prerequisite`/`unlocks`/`tangent`). Reuses t-1's
 *   {@link GraphStore.reachableFrom}. (Interpreting the spec's "unreachable *required*
 *   node" as "every authored node should be reachable" — owner to confirm.)
 *
 * {@link validateGraphInvariants} is **pure** (no DB — its unit tests need no mock)
 * and **standalone/callable**, so `f-emergence` (18) runs every
 * `StructureChangeProposal` through the identical stage (F17), and
 * `validatePublishableMap` (map/version-service) calls it as its graph-invariant
 * stage — kept synchronous (no I/O in the blocking checks).
 *
 * The **live-key-removal warning** is separate — `checkLiveKeyImpact` in
 * `live-key-impact.ts`: it is a *warning*, not a hard block (F2 — "warn the admin
 * when removing a key with live state"), and it needs journey-state I/O, so it can't
 * ride the throw-or-return `validatePublishableMap` contract, and it lives in its own
 * DB-touching module so this one stays pure (B12).
 */

import type { EdgeType, MapDefinition } from '@/lib/framework/facilitation/map/schema';
import { inMemoryGraphStore } from '@/lib/framework/facilitation/engine/graph-store';

/** Edges that gate reaching a node (used to find roots + traverse reachability). */
const GATING_EDGES: readonly EdgeType[] = ['prerequisite', 'unlocks'];
/** Edges a walker follows to progress (gates + the always-open tangent side path). */
const PROGRESSION_EDGES: readonly EdgeType[] = ['prerequisite', 'unlocks', 'tangent'];

/** A blocking graph-invariant violation (publish is refused). */
export interface GraphInvariantError {
  code: 'PREREQUISITE_CYCLE' | 'UNREACHABLE_NODE';
  message: string;
  /** The offending node key(s), for editor surfacing. */
  path: string[];
}

export interface GraphInvariantResult {
  ok: boolean;
  errors: GraphInvariantError[];
}

/**
 * The pure, blocking graph invariants. Accumulates every violation (an author sees
 * the whole picture), so `ok` is `errors.length === 0`. Assumes the definition has
 * already passed `validateMapFormat` (no dangling endpoints); traversal tolerates
 * them regardless (they are simply skipped).
 */
export function validateGraphInvariants(definition: MapDefinition): GraphInvariantResult {
  const store = inMemoryGraphStore(definition);
  const errors: GraphInvariantError[] = [];

  // 1. No cycles among prerequisite edges (an unsatisfiable deadlock).
  for (const cycle of store.findCycles({ edgeTypes: ['prerequisite'] })) {
    errors.push({
      code: 'PREREQUISITE_CYCLE',
      message: `Prerequisite cycle: ${cycle.join(' → ')} → ${cycle[0]}.`,
      path: [...cycle],
    });
  }

  // 2. Every node reachable from a root. Roots have no incoming gate; from them,
  //    follow progression edges (gates + tangent) to the reachable set.
  const reachable = new Set<string>();
  for (const node of definition.nodes) {
    const isRoot =
      store.neighbours(node.key, { direction: 'in', edgeTypes: GATING_EDGES }).length === 0;
    if (!isRoot) continue;
    reachable.add(node.key);
    for (const key of store.reachableFrom(node.key, { edgeTypes: PROGRESSION_EDGES })) {
      reachable.add(key);
    }
  }
  for (const node of definition.nodes) {
    if (!reachable.has(node.key)) {
      errors.push({
        code: 'UNREACHABLE_NODE',
        message: `Node "${node.key}" is unreachable — no path to it from any entry node.`,
        path: [node.key],
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

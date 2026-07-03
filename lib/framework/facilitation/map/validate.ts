/**
 * Within-snapshot referential integrity for a facilitation map (f-map t-1).
 *
 * `mapDefinitionSchema` (schema.ts) validates each node/edge/condition in
 * ISOLATION. This function adds the checks that need the WHOLE snapshot —
 * cross-references Zod cannot see across array elements: unique node keys, edge
 * endpoints that resolve, and region containers that resolve to a region node
 * without cycling.
 *
 * Deliberately NOT here — they belong to `f-engine` (spec §5.3 / §5.5, and see
 * f-map.md decision 3): prerequisite-edge cycles, unreachable-required nodes,
 * and "removing a key that has live user state" warnings — all need graph
 * traversal or journey state, which the engine owns. This is FORMAT validation;
 * the engine adds INVARIANT validation as a later step in the same publish
 * chain (`validatePublishableMap` in t-2 is written to be extended, not
 * reshaped).
 *
 * Pure and DB-free. Returns `{ ok, errors }`, mirroring the workflow validator.
 */

import type { MapDefinition, MapNode } from '@/lib/framework/facilitation/map/schema';

export interface MapValidationError {
  code:
    | 'DUPLICATE_NODE_KEY'
    | 'DANGLING_EDGE_ENDPOINT'
    | 'DANGLING_REGION_REF'
    | 'REGION_REF_NOT_REGION'
    | 'REGION_CYCLE';
  message: string;
  /** The offending node key / edge index, for editor surfacing. */
  path?: string[];
}

export interface MapValidationResult {
  ok: boolean;
  errors: MapValidationError[];
}

/**
 * Check a (Zod-parsed) map snapshot's cross-element integrity. Accumulates every
 * error rather than failing on the first, so an author sees the whole picture.
 */
export function validateMapFormat(definition: MapDefinition): MapValidationResult {
  const errors: MapValidationError[] = [];
  const { nodes, edges } = definition;

  // ---- Unique node keys, and an index for the checks below ---------------
  const keyToNode = new Map<string, MapNode>();
  const duplicates = new Set<string>();
  for (const node of nodes) {
    if (keyToNode.has(node.key)) duplicates.add(node.key);
    else keyToNode.set(node.key, node);
  }
  for (const key of duplicates) {
    errors.push({
      code: 'DUPLICATE_NODE_KEY',
      message: `Duplicate node key "${key}".`,
      path: [key],
    });
  }

  // ---- Edge endpoints resolve to a node ----------------------------------
  edges.forEach((edge, i) => {
    for (const endpoint of [edge.from, edge.to]) {
      if (!keyToNode.has(endpoint)) {
        errors.push({
          code: 'DANGLING_EDGE_ENDPOINT',
          message: `Edge ${edge.from}→${edge.to} references unknown node "${endpoint}".`,
          path: [`edges[${i}]`],
        });
      }
    }
  });

  // ---- Region refs resolve to a region-type node -------------------------
  for (const node of nodes) {
    if (node.region === undefined) continue;
    const container = keyToNode.get(node.region);
    if (!container) {
      errors.push({
        code: 'DANGLING_REGION_REF',
        message: `Node "${node.key}" references unknown region "${node.region}".`,
        path: [node.key],
      });
    } else if (container.type !== 'region') {
      errors.push({
        code: 'REGION_REF_NOT_REGION',
        message: `Node "${node.key}" references "${node.region}", which is not a region node.`,
        path: [node.key],
      });
    }
  }

  // ---- Region-containment tree is acyclic (F5 hierarchy) -----------------
  // Distinct from prerequisite-edge cycles (f-engine). Each node has at most one
  // region parent, so this is a functional graph; walk each node's parent chain
  // and a repeat within one walk means the walk entered a cycle. Only resolved
  // links are walked (dangling refs are already reported above). One cycle is
  // reachable from several start nodes, so dedupe on the cycle's node set (a
  // canonical key) to report each distinct cycle exactly once.
  const reportedCycles = new Set<string>();
  for (const start of nodes) {
    if (start.region === undefined) continue;
    const seen = new Set<string>([start.key]);
    let cursor: string | undefined = start.region;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        // `cursor` is the cycle's entry node; collect the loop from it.
        const cycle: string[] = [];
        let node: string | undefined = cursor;
        do {
          cycle.push(node);
          node = keyToNode.get(node)?.region;
        } while (node !== undefined && node !== cursor);
        const canonical = [...cycle].sort().join(',');
        if (!reportedCycles.has(canonical)) {
          reportedCycles.add(canonical);
          errors.push({
            code: 'REGION_CYCLE',
            message: `Region containment cycle: ${cycle.join(' → ')} → ${cycle[0]}.`,
            path: cycle,
          });
        }
        break;
      }
      seen.add(cursor);
      cursor = keyToNode.get(cursor)?.region;
    }
  }

  return { ok: errors.length === 0, errors };
}

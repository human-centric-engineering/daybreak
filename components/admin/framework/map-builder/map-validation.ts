/**
 * Live-preflight validation for the map editor (f-map-editor t-3).
 *
 * The editor rings offending nodes and lists their problems as the author works,
 * *before* the publish round-trip. Both underlying validators are pure and DB-free
 * — `validateMapFormat` (static structural integrity: duplicate keys, dangling
 * endpoints, region-containment cycles) and `validateGraphInvariants` (the engine's
 * conditional invariants: prerequisite cycles, unreachable nodes) — so this runs
 * client-side with no server round-trip (feature plan decision 3).
 *
 * This module only *combines and normalises* their output into one editor-facing
 * issue list keyed by node: each issue carries the node keys it references (a node
 * key === the React Flow node id, so the caller rings + click-selects directly).
 * Kept pure and React-free so it unit-tests without a DOM.
 *
 * The per-node Zod shape rule "a `module` node needs a `moduleSlug`" is deliberately
 * NOT surfaced here — it belongs to the publish parse (`mapDefinitionSchema`), which
 * the version controls (t-4) surface as the authoritative 400; the node inspector
 * flags a missing binding inline as it is edited.
 */

import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import {
  validateMapFormat,
  type MapValidationError,
} from '@/lib/framework/facilitation/map/validate';
import {
  validateGraphInvariants,
  type GraphInvariantError,
} from '@/lib/framework/facilitation/engine/invariants';

/** The union of every code either validator can raise, for a per-code badge/style. */
export type MapIssueCode = MapValidationError['code'] | GraphInvariantError['code'];

/** One normalised editor-facing validation issue. */
export interface MapEditorIssue {
  code: MapIssueCode;
  message: string;
  /**
   * The node keys this issue points at (already filtered to keys that resolve to a
   * node on the canvas). Empty when the issue is edge-scoped (e.g. a dangling
   * endpoint whose only path entry is `edges[i]`), so the panel still lists it but
   * cannot ring a node.
   */
  nodeKeys: string[];
}

/**
 * Run both pure validators over a (mapper-produced) definition and return one
 * combined, node-keyed issue list. Accumulates every problem — an author sees the
 * whole picture, not just the first failure.
 */
export function collectMapIssues(definition: MapDefinition): MapEditorIssue[] {
  const nodeKeys = new Set(definition.nodes.map((n) => n.key));
  const raw = [
    ...validateMapFormat(definition).errors,
    ...validateGraphInvariants(definition).errors,
  ];
  return raw.map((error) => ({
    code: error.code,
    message: error.message,
    // A validator's `path` mixes node keys with edge markers (`edges[i]`); keep only
    // the entries that resolve to a real node so the caller can ring/select them.
    nodeKeys: (error.path ?? []).filter((entry) => nodeKeys.has(entry)),
  }));
}

/** The set of node ids to ring, unioned across every issue. */
export function issueNodeIds(issues: readonly MapEditorIssue[]): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) for (const key of issue.nodeKeys) ids.add(key);
  return ids;
}

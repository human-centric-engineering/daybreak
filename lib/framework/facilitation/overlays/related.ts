/**
 * "Related places" enrichment (f-overlays t-2, spec §5.4, F9) — fills each ranked move's advisory
 * `related` slot with thematically-similar nodes (pgvector cosine over the node embeddings from t-1).
 *
 * F9 is the load-bearing invariant: this runs STRICTLY DOWNSTREAM of `computeAvailability`/`rankMoves`
 * — it decorates the already-ranked moves and never feeds eligibility. It is a pure decorate-and-return
 * over the moves array; the caller (`guidance.loadGuidance`) computes availability first, independently.
 *
 * Graceful when the current published version has no embeddings (never synced, or freshly republished
 * before a re-embed): a single cheap count short-circuits, so `related` stays empty rather than firing a
 * query per move. The `related` field is advisory only — agents narrate it; it is never a gate.
 */

import type { RankedMove } from '@/lib/framework/guidance/ranking';
import {
  countNodeEmbeddings,
  findRelatedNodes,
} from '@/lib/framework/facilitation/overlays/queries';

/**
 * How many related places to surface per move — a few, not a flood. Documented default (like the ranking
 * weights), tunable in one place; not a config surface yet.
 */
export const RELATED_LIMIT = 3;

/**
 * Cosine-distance ceiling for a node to count as "related" (0 = identical, 2 = opposite). A curation
 * gate: below it a similar node is surfaced, above it nothing is (better empty than a spurious "related"
 * in a small map). Documented default, owner-tunable.
 */
export const RELATED_MAX_DISTANCE = 0.6;

/**
 * Return a copy of `moves` with each move's `related` filled from node similarity within `(graphSlug,
 * version)`. When the version has no embeddings, returns the moves unchanged (all `related` stay empty).
 */
export async function enrichMovesWithRelated(
  graphSlug: string,
  version: number,
  moves: readonly RankedMove[]
): Promise<RankedMove[]> {
  if (moves.length === 0) return [...moves];

  // Short-circuit the common "not embedded yet" case with one count rather than a query per move.
  const embedded = await countNodeEmbeddings(graphSlug, version);
  if (embedded === 0) return [...moves];

  return Promise.all(
    moves.map(async (move) => ({
      ...move,
      related: await findRelatedNodes(
        graphSlug,
        version,
        move.nodeKey,
        RELATED_LIMIT,
        RELATED_MAX_DISTANCE
      ),
    }))
  );
}

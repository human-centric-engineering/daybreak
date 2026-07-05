/**
 * Guidance ranking (f-guidance t-1, spec §5.4, F12) — **pure**.
 *
 * The engine (`computeAvailability`) has already decided **what is possible**: `validMoves`
 * is the eligible set, `firsts` the never-reached first-arrival nodes. This module decides
 * **what is wise** — it ranks the *already-eligible* moves using recency-weighted slot signals
 * and returns a reason string per contributing signal. It **never re-evaluates a gate** (F12 by
 * construction): eligibility is the engine's; ranking is advisory.
 *
 * The weighting is a **transparent, documented default** (constants below, "owner to tune") —
 * not a config surface (an authored ranking *policy* is `f-policies` (17) if a real need appears).
 * Because every option carries its reasons, the ranking is auditable without configuration.
 *
 * The `related` field on each move is the **advisory "related places" slot** — always empty here;
 * pgvector similarity is never a guidance-ranking input in this feature (F9), so `f-overlays` (19)
 * fills it later. Shipping it empty (not stubbed) is the seam, not demo data.
 */

import type { NodeKey } from '@/lib/framework/shared/scope';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import type { AvailabilityResult } from '@/lib/framework/facilitation/engine/availability';

/** One slot head as the ranker reads it — the recency (`capturedAt`) + quality
 *  (`confidence` 1–10) signals. A `SlotValue` row structurally satisfies this. */
export interface RankSlotHead {
  slotSlug: string;
  confidence: number;
  capturedAt: Date;
}

/** A single scored reason contributing to a move's rank — the auditable "why". */
export interface RankReason {
  code: 'first_arrival' | 'soft_deadline' | 'missing_slot' | 'low_confidence' | 'recently_changed';
  detail: string;
}

/** One ranked eligible move. */
export interface RankedMove {
  nodeKey: NodeKey;
  score: number;
  reasons: readonly RankReason[];
  /** Advisory "related places" — always empty (F9); `f-overlays` (19) fills it. */
  related: readonly NodeKey[];
}

export interface RankMovesInput {
  graph: GraphStore;
  availability: AvailabilityResult;
  slotHeads: readonly RankSlotHead[];
  now: Date;
}

/**
 * Default signal weights — the "what is wise" heuristic, tunable in one place. Higher
 * pulls a move up. Documented so the ranking is legible; `f-policies` (17) may later make
 * them authored, but shipping a config hook now is the premature abstraction we avoid.
 */
const WEIGHT = {
  /** A never-visited first-arrival node — new ground worth surfacing. */
  firstArrival: 3,
  /** An incoming `recommended_by` soft deadline that is near or past. */
  softDeadline: 4,
  /** A gating slot with no reading yet — the move would gather it. */
  missingSlot: 2,
  /** A gating slot read at low confidence — the move would firm it up. */
  lowConfidence: 2,
  /** A gating slot updated recently — the move follows a live thread. */
  recentlyChanged: 1,
} as const;

/** `confidence` is 1–10; ≤ this is "tentative". */
const LOW_CONFIDENCE_MAX = 4;
/** A slot updated within this window of `now` counts as "recently changed". */
const RECENCY_WINDOW_MS = 48 * 60 * 60 * 1000;
/** A `recommended_by` date within this window of `now` (or already past) is "near". */
const SOFT_DEADLINE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Rank the engine's `validMoves`, freshest/most-useful first. Deterministic: ties break
 * by `nodeKey` ascending so the order is reproducible for prompt/context builders.
 */
export function rankMoves(input: RankMovesInput): RankedMove[] {
  const bySlug = new Map(input.slotHeads.map((h) => [h.slotSlug, h]));
  const moves = input.availability.validMoves.map((nodeKey) => scoreNode(nodeKey, input, bySlug));
  return moves.sort(
    (a, b) => b.score - a.score || (a.nodeKey < b.nodeKey ? -1 : a.nodeKey > b.nodeKey ? 1 : 0)
  );
}

function scoreNode(
  nodeKey: NodeKey,
  input: RankMovesInput,
  bySlug: ReadonlyMap<string, RankSlotHead>
): RankedMove {
  const reasons: RankReason[] = [];
  let score = 0;

  if (input.availability.firsts.includes(nodeKey)) {
    score += WEIGHT.firstArrival;
    reasons.push({ code: 'first_arrival', detail: `"${nodeKey}" is a new area not yet visited.` });
  }

  // A node's gating slots + soft deadline come from its INCOMING *eligibility* edges (the
  // gates that lead to it). An eligible node has satisfied those gates; their
  // freshness/confidence is what makes surfacing the node timely. `related_to` is
  // advisory-only and is NEVER an eligibility edge (mirroring `computeAvailability`), so a
  // condition on one is not a gate and must not score — its role is the `related` overlay
  // (F9, `f-overlays` 19).
  const relevantSlugs = new Set<string>();
  let softDeadlineScored = false;
  for (const edge of input.graph.neighbours(nodeKey, { direction: 'in' })) {
    if (edge.type === 'related_to') continue;
    const condition = edge.condition;
    if (condition === undefined) continue;
    if (condition.family === 'slot') {
      relevantSlugs.add(condition.slug);
    } else if (
      !softDeadlineScored &&
      condition.family === 'temporal' &&
      condition.kind === 'recommended_by' &&
      condition.at !== undefined
    ) {
      const at = Date.parse(condition.at);
      if (!Number.isNaN(at) && at - input.now.getTime() <= SOFT_DEADLINE_WINDOW_MS) {
        score += WEIGHT.softDeadline;
        reasons.push({ code: 'soft_deadline', detail: `Recommended around ${condition.at}.` });
        softDeadlineScored = true; // score a node's soft deadline at most once
      }
    }
  }

  for (const slug of relevantSlugs) {
    const head = bySlug.get(slug);
    if (head === undefined) {
      score += WEIGHT.missingSlot;
      reasons.push({ code: 'missing_slot', detail: `Would gather "${slug}", not yet known.` });
      continue;
    }
    if (head.confidence <= LOW_CONFIDENCE_MAX) {
      score += WEIGHT.lowConfidence;
      reasons.push({ code: 'low_confidence', detail: `Would firm up "${slug}", still tentative.` });
    }
    if (input.now.getTime() - head.capturedAt.getTime() <= RECENCY_WINDOW_MS) {
      score += WEIGHT.recentlyChanged;
      reasons.push({
        code: 'recently_changed',
        detail: `Follows up on "${slug}", recently updated.`,
      });
    }
  }

  return { nodeKey, score, reasons, related: [] };
}

/** A linger-here vs move-on recommendation (spec §5.4 — the facilitator voice). */
export type FocusRecommendation = 'linger' | 'move';

export interface FocusSuggestion {
  recommendation: FocusRecommendation;
  reason: string;
  /** The top ranked move (when any is eligible) — what a "move" would surface. */
  topMove?: RankedMove;
}

/** A move must clear this score to pull the user onward; below it, there is room to linger. */
const MOVE_SCORE_THRESHOLD = 3;

/**
 * Recommend lingering (deepen the current focus) vs moving on, from the ranked moves.
 * Pure: the caller supplies `rankMoves` output. The current surface ("here") is the
 * agent's to name; this returns the signal + a reason it narrates.
 */
export function suggestFocus(rankedMoves: readonly RankedMove[]): FocusSuggestion {
  const top = rankedMoves[0];
  if (top === undefined) {
    return {
      recommendation: 'linger',
      reason: 'Nothing new is unlocked yet — stay with the current focus.',
    };
  }
  if (top.score >= MOVE_SCORE_THRESHOLD) {
    return {
      recommendation: 'move',
      reason: `A next step ("${top.nodeKey}") is worth surfacing now.`,
      topMove: top,
    };
  }
  return {
    recommendation: 'linger',
    reason: 'No next step is pressing — there is room to go deeper here.',
    topMove: top,
  };
}

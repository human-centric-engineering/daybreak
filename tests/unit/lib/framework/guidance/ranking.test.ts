/**
 * Guidance ranking (f-guidance t-1) — pure. Asserts ORDERING BEHAVIOUR and which reason
 * codes fire, never the magic weight coefficients (so the default weighting stays tunable
 * without churning tests). A minimal GraphStore/AvailabilityResult stub feeds the ranker.
 */

import { describe, it, expect } from 'vitest';
import { rankMoves, suggestFocus, type RankSlotHead } from '@/lib/framework/guidance/ranking';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import type { AvailabilityResult } from '@/lib/framework/facilitation/engine/availability';
import type { MapEdge } from '@/lib/framework/facilitation/map/schema';

const NOW = new Date('2026-07-05T12:00:00Z');

/** A GraphStore that only answers incoming-edge queries (all the ranker uses). */
function graphWith(incoming: Record<string, MapEdge[]>): GraphStore {
  return {
    neighbours: (key: string, options?: { direction?: string }) =>
      options?.direction === 'in' ? (incoming[key] ?? []) : [],
  } as unknown as GraphStore;
}

function availability(validMoves: string[], firsts: string[] = []): AvailabilityResult {
  return { perNode: new Map(), validMoves, firsts };
}

const slotEdge = (from: string, to: string, slug: string): MapEdge => ({
  from,
  to,
  type: 'prerequisite',
  condition: { family: 'slot', slug, op: 'gte', value: 1 },
});
const recommendedByEdge = (from: string, to: string, at: string): MapEdge => ({
  from,
  to,
  type: 'unlocks',
  condition: { family: 'temporal', kind: 'recommended_by', at },
});
const head = (slotSlug: string, confidence: number, capturedAt: Date): RankSlotHead => ({
  slotSlug,
  confidence,
  capturedAt,
});

describe('rankMoves', () => {
  it('scores a first-arrival node and labels the reason', () => {
    const [move] = rankMoves({
      graph: graphWith({}),
      availability: availability(['welcome'], ['welcome']),
      slotHeads: [],
      now: NOW,
    });
    expect(move.nodeKey).toBe('welcome');
    expect(move.score).toBeGreaterThan(0);
    expect(move.reasons.map((r) => r.code)).toContain('first_arrival');
    expect(move.related).toEqual([]); // advisory slot ships empty (F9)
  });

  it('boosts a node gating on a missing slot vs one whose slot is known+confident', () => {
    const graph = graphWith({
      needs: [slotEdge('a', 'needs', 'unknown_slot')],
      known: [slotEdge('a', 'known', 'known_slot')],
    });
    const moves = rankMoves({
      graph,
      availability: availability(['needs', 'known']),
      slotHeads: [head('known_slot', 9, new Date('2026-01-01T00:00:00Z'))], // old + confident
      now: NOW,
    });
    expect(moves[0].nodeKey).toBe('needs'); // missing-slot node ranks first
    expect(moves[0].reasons.map((r) => r.code)).toContain('missing_slot');
    // The known, old, confident slot fires no signal at all.
    expect(moves[1].reasons).toHaveLength(0);
  });

  it('fires low_confidence and recently_changed for a fresh, tentative gating slot', () => {
    const graph = graphWith({ n: [slotEdge('a', 'n', 'mood')] });
    const [move] = rankMoves({
      graph,
      availability: availability(['n']),
      slotHeads: [head('mood', 3, new Date('2026-07-05T06:00:00Z'))], // conf 3, 6h ago
      now: NOW,
    });
    const codes = move.reasons.map((r) => r.code);
    expect(codes).toContain('low_confidence');
    expect(codes).toContain('recently_changed');
  });

  it('scores a near/past soft deadline but not one beyond the window', () => {
    const near = rankMoves({
      graph: graphWith({ n: [recommendedByEdge('a', 'n', '2026-07-10T12:00:00Z')] }), // +5d
      availability: availability(['n']),
      slotHeads: [],
      now: NOW,
    });
    expect(near[0].reasons.map((r) => r.code)).toContain('soft_deadline');

    const far = rankMoves({
      graph: graphWith({ n: [recommendedByEdge('a', 'n', '2026-09-01T12:00:00Z')] }), // +2mo
      availability: availability(['n']),
      slotHeads: [],
      now: NOW,
    });
    expect(far[0].reasons.map((r) => r.code)).not.toContain('soft_deadline');
    expect(far[0].score).toBe(0);
  });

  it('ignores conditions on related_to edges (advisory-only, not a gate — mirrors the engine)', () => {
    const relatedSlotEdge: MapEdge = {
      from: 'a',
      to: 'n',
      type: 'related_to',
      condition: { family: 'slot', slug: 'unknown_slot', op: 'gte', value: 1 },
    };
    const relatedDeadlineEdge: MapEdge = {
      from: 'b',
      to: 'n',
      type: 'related_to',
      condition: { family: 'temporal', kind: 'recommended_by', at: '2026-07-06T12:00:00Z' },
    };
    const [move] = rankMoves({
      graph: graphWith({ n: [relatedSlotEdge, relatedDeadlineEdge] }),
      availability: availability(['n']),
      slotHeads: [],
      now: NOW,
    });
    expect(move.score).toBe(0); // neither the slug nor the soft deadline on related_to scores
    expect(move.reasons).toHaveLength(0);
  });

  it('orders by score desc, breaking ties by nodeKey ascending (deterministic)', () => {
    // Two zero-score nodes → tie broken by key; one first-arrival node outranks both.
    const moves = rankMoves({
      graph: graphWith({}),
      availability: availability(['zebra', 'alpha', 'boosted'], ['boosted']),
      slotHeads: [],
      now: NOW,
    });
    expect(moves.map((m) => m.nodeKey)).toEqual(['boosted', 'alpha', 'zebra']);
  });

  it('returns an empty list when there are no eligible moves', () => {
    expect(
      rankMoves({ graph: graphWith({}), availability: availability([]), slotHeads: [], now: NOW })
    ).toEqual([]);
  });
});

describe('suggestFocus', () => {
  it('lingers when nothing is eligible', () => {
    expect(suggestFocus([]).recommendation).toBe('linger');
  });

  it('moves when the top move clears the threshold', () => {
    const move = { nodeKey: 'n', score: 5, reasons: [], related: [] };
    const s = suggestFocus([move]);
    expect(s.recommendation).toBe('move');
    expect(s.topMove).toBe(move);
  });

  it('lingers when the top move is below the threshold', () => {
    const s = suggestFocus([{ nodeKey: 'n', score: 1, reasons: [], related: [] }]);
    expect(s.recommendation).toBe('linger');
    expect(s.topMove?.nodeKey).toBe('n');
  });
});

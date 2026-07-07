/**
 * "Related places" enrichment (f-overlays t-2). Mocks the read queries. Proves the count short-circuit
 * (no per-move query when nothing is embedded), the per-move fill when embeddings exist, and the
 * empty-moves passthrough — the F9-safe advisory decoration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/overlays/queries', () => ({
  countNodeEmbeddings: vi.fn(),
  findRelatedNodes: vi.fn(),
}));

import {
  enrichMovesWithRelated,
  RELATED_LIMIT,
  RELATED_MAX_DISTANCE,
} from '@/lib/framework/facilitation/overlays/related';
import {
  countNodeEmbeddings,
  findRelatedNodes,
} from '@/lib/framework/facilitation/overlays/queries';
import type { RankedMove } from '@/lib/framework/guidance/ranking';

const move = (nodeKey: string): RankedMove => ({ nodeKey, score: 1, reasons: [], related: [] });

beforeEach(() => vi.clearAllMocks());

describe('enrichMovesWithRelated', () => {
  it('fills each move’s related from the similarity query when embeddings exist', async () => {
    vi.mocked(countNodeEmbeddings).mockResolvedValue(5);
    vi.mocked(findRelatedNodes).mockImplementation(async (_s, _v, nodeKey) =>
      nodeKey === 'a' ? ['b'] : ['a']
    );

    const result = await enrichMovesWithRelated('primary', 2, [move('a'), move('b')]);
    expect(result.map((m) => m.related)).toEqual([['b'], ['a']]);
    // Queried per move with the documented limit + threshold defaults.
    expect(findRelatedNodes).toHaveBeenCalledWith(
      'primary',
      2,
      'a',
      RELATED_LIMIT,
      RELATED_MAX_DISTANCE
    );
    expect(findRelatedNodes).toHaveBeenCalledTimes(2);
  });

  it('short-circuits (no per-move query) when the version has no embeddings', async () => {
    vi.mocked(countNodeEmbeddings).mockResolvedValue(0);
    const moves = [move('a'), move('b')];
    const result = await enrichMovesWithRelated('primary', 2, moves);
    expect(result.map((m) => m.related)).toEqual([[], []]); // unchanged
    expect(findRelatedNodes).not.toHaveBeenCalled();
  });

  it('passes empty moves straight through without touching the DB', async () => {
    const result = await enrichMovesWithRelated('primary', 2, []);
    expect(result).toEqual([]);
    expect(countNodeEmbeddings).not.toHaveBeenCalled();
    expect(findRelatedNodes).not.toHaveBeenCalled();
  });
});

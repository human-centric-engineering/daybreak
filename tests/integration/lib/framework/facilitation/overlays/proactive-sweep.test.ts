/**
 * Proactive-guidance sweep (f-overlays t-3a). Mocks the enumerator and the guidance load; uses the real
 * (pure) `suggestFocus`. Proves: a stalled journey with a `move`-worthy next step becomes a candidate,
 * a `linger` journey does not, a null guidance is skipped, self-viewer is used, and the day→instant helper.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/overlays/active-journeys', () => ({
  listStalledActiveJourneys: vi.fn(),
}));
vi.mock('@/lib/framework/guidance/guidance', () => ({ loadGuidance: vi.fn() }));

import {
  runProactiveGuidanceSweep,
  stalledBeforeFromDays,
} from '@/lib/framework/facilitation/overlays/proactive-sweep';
import { listStalledActiveJourneys } from '@/lib/framework/facilitation/overlays/active-journeys';
import { loadGuidance } from '@/lib/framework/guidance/guidance';

const journey = (id: string, userId: string) => ({
  id,
  userId,
  graphSlug: 'onboarding',
  contextKey: '',
  startedAt: new Date(0),
});
// suggestFocus returns 'move' when the top move's score >= 3, else 'linger'.
const guidanceWith = (nodeKey: string, score: number) =>
  ({
    context: {},
    availability: {},
    moves: [{ nodeKey, score, reasons: [], related: [] }],
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runProactiveGuidanceSweep', () => {
  it('returns a candidate per stalled journey whose top move clears the move threshold', async () => {
    vi.mocked(listStalledActiveJourneys).mockResolvedValue([
      journey('j1', 'u1'),
      journey('j2', 'u2'),
    ] as never);
    vi.mocked(loadGuidance)
      .mockResolvedValueOnce(guidanceWith('next', 5)) // move-worthy
      .mockResolvedValueOnce(guidanceWith('meh', 1)); // linger → not a candidate

    const before = new Date('2026-07-01T00:00:00Z');
    const result = await runProactiveGuidanceSweep({ stalledBefore: before, maxJourneys: 100 });

    expect(result.scanned).toBe(2);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      userId: 'u1',
      journeyId: 'j1',
      graphSlug: 'onboarding',
      nodeKey: 'next',
      score: 5,
    });
    expect(listStalledActiveJourneys).toHaveBeenCalledWith(before, 100);
    // Guidance is loaded under the journey's OWN (self) viewer, with its context key.
    expect(loadGuidance).toHaveBeenCalledWith(
      { userId: 'u1' },
      { userId: 'u1', graphSlug: 'onboarding', contextKey: '' }
    );
  });

  it('skips a journey whose guidance cannot be loaded (partial result, not fatal)', async () => {
    vi.mocked(listStalledActiveJourneys).mockResolvedValue([
      journey('j1', 'u1'),
      journey('j2', 'u2'),
    ] as never);
    vi.mocked(loadGuidance)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(guidanceWith('next', 4));

    const result = await runProactiveGuidanceSweep({
      stalledBefore: new Date(),
      maxJourneys: 100,
    });
    expect(result.scanned).toBe(2);
    expect(result.candidates.map((c) => c.journeyId)).toEqual(['j2']);
  });

  it('returns no candidates when nothing is stalled', async () => {
    vi.mocked(listStalledActiveJourneys).mockResolvedValue([]);
    const result = await runProactiveGuidanceSweep({
      stalledBefore: new Date(),
      maxJourneys: 100,
    });
    expect(result).toEqual({ scanned: 0, candidates: [] });
    expect(loadGuidance).not.toHaveBeenCalled();
  });
});

describe('stalledBeforeFromDays', () => {
  it('subtracts the day count from now', () => {
    const now = new Date('2026-07-08T00:00:00Z');
    expect(stalledBeforeFromDays(7, now).toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

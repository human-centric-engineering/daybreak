/**
 * Guidance orchestration (f-guidance t-1). Mocks the assembler, the engine, and the timeline
 * read; asserts `loadGuidance` composes assemble → computeAvailability → rankMoves, the
 * null-passthrough ("nothing to guide"), the focus suggestion, and the synopsis path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/guidance/assemble', () => ({ assembleJourneyContext: vi.fn() }));
vi.mock('@/lib/framework/facilitation/engine/availability', () => ({
  computeAvailability: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/engine/apply-event', () => ({ applyEvent: vi.fn() }));
vi.mock('@/lib/framework/facilitation/journey/queries', () => ({ getJourneyTimeline: vi.fn() }));

import {
  loadGuidance,
  loadFocusSuggestion,
  loadProgressSynopsis,
  applyJourneyTransition,
} from '@/lib/framework/guidance/guidance';
import { assembleJourneyContext } from '@/lib/framework/guidance/assemble';
import { computeAvailability } from '@/lib/framework/facilitation/engine/availability';
import { applyEvent } from '@/lib/framework/facilitation/engine/apply-event';
import { getJourneyTimeline } from '@/lib/framework/facilitation/journey/queries';

const viewer = { userId: 'user-1' };
const key = { userId: 'user-1', graphSlug: 'onboarding' };

const availabilityInput = {
  graph: { neighbours: () => [] },
  now: new Date('2026-07-05T12:00:00Z'),
};
const context = {
  journey: { id: 'journey-1' },
  nodeStates: [{ nodeKey: 'a', status: 'completed' }],
  slotHeads: [],
  now: { instant: new Date('2026-07-05T12:00:00Z'), timeZone: 'UTC' },
  availabilityInput,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assembleJourneyContext).mockResolvedValue(context);
  vi.mocked(computeAvailability).mockReturnValue({
    perNode: new Map(),
    validMoves: ['next'],
    firsts: ['next'],
  });
  vi.mocked(getJourneyTimeline).mockResolvedValue([] as never);
});

describe('loadGuidance', () => {
  it('composes assemble → computeAvailability → rankMoves', async () => {
    const guidance = await loadGuidance(viewer, key);
    expect(guidance).not.toBeNull();
    expect(computeAvailability).toHaveBeenCalledWith(availabilityInput);
    expect(guidance!.moves.map((m) => m.nodeKey)).toEqual(['next']); // ranked from validMoves
    expect(guidance!.moves[0].reasons.map((r) => r.code)).toContain('first_arrival');
  });

  it('returns null when there is nothing to guide', async () => {
    vi.mocked(assembleJourneyContext).mockResolvedValue(null);
    expect(await loadGuidance(viewer, key)).toBeNull();
    expect(computeAvailability).not.toHaveBeenCalled();
  });
});

describe('loadFocusSuggestion', () => {
  it('derives a linger/move recommendation from the ranked moves', async () => {
    const s = await loadFocusSuggestion(viewer, key);
    expect(s).not.toBeNull();
    expect(['linger', 'move']).toContain(s!.recommendation);
  });

  it('is null when nothing to guide', async () => {
    vi.mocked(assembleJourneyContext).mockResolvedValue(null);
    expect(await loadFocusSuggestion(viewer, key)).toBeNull();
  });
});

describe('loadProgressSynopsis', () => {
  it('reads the timeline (desc) and digests the node states', async () => {
    const s = await loadProgressSynopsis(viewer, key);
    expect(getJourneyTimeline).toHaveBeenCalledWith(
      viewer,
      { journeyId: 'journey-1', subject: 'user-1' },
      { order: 'desc' },
      undefined
    );
    expect(s).toMatchObject({ totalTracked: 1, completed: 1, milestones: ['a'] });
  });

  it('is null when the journey has not started', async () => {
    vi.mocked(assembleJourneyContext).mockResolvedValue(null);
    expect(await loadProgressSynopsis(viewer, key)).toBeNull();
    expect(getJourneyTimeline).not.toHaveBeenCalled();
  });
});

describe('applyJourneyTransition', () => {
  it('assembles the context and calls applyEvent with the resolved transition', async () => {
    vi.mocked(applyEvent).mockResolvedValue({ ok: true, nodeState: {}, event: {} } as never);
    await applyJourneyTransition(viewer, key, { nodeKey: 'intro', kind: 'enter' });
    expect(applyEvent).toHaveBeenCalledWith({
      ...availabilityInput,
      transition: { userId: 'user-1', journeyId: 'journey-1', nodeKey: 'intro', kind: 'enter' },
    });
  });

  it('returns null (no write) when the journey has not started', async () => {
    vi.mocked(assembleJourneyContext).mockResolvedValue(null);
    expect(
      await applyJourneyTransition(viewer, key, { nodeKey: 'n', kind: 'complete' })
    ).toBeNull();
    expect(applyEvent).not.toHaveBeenCalled();
  });
});

/**
 * Availability-input assembler (f-guidance t-1). Mocks every read so no live DB loads.
 * Proves: null when no published map / journey not started; the `canRead` guard propagates
 * (a denied journey read throws, before any slot read); the module-liveness map is built from
 * the flag rows; and a well-formed `AvailabilityInput` is handed back.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/engine/published-graph', () => ({
  getPublishedGraph: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/engine/now', () => ({ resolveJourneyNow: vi.fn() }));
vi.mock('@/lib/framework/facilitation/journey/queries', () => ({
  getJourney: vi.fn(),
  getNodeStates: vi.fn(),
}));
vi.mock('@/lib/framework/data-slots/values', () => ({ getSlotHeads: vi.fn() }));
vi.mock('@/lib/framework/modules/queries', () => ({ listModules: vi.fn() }));
vi.mock('@/lib/feature-flags', () => ({ getAllFlags: vi.fn() }));

import { assembleJourneyContext } from '@/lib/framework/guidance/assemble';
import { getPublishedGraph } from '@/lib/framework/facilitation/engine/published-graph';
import { resolveJourneyNow } from '@/lib/framework/facilitation/engine/now';
import { getJourney, getNodeStates } from '@/lib/framework/facilitation/journey/queries';
import { getSlotHeads } from '@/lib/framework/data-slots/values';
import { listModules } from '@/lib/framework/modules/queries';
import { getAllFlags } from '@/lib/feature-flags';

const viewer = { userId: 'user-1' };
const key = { userId: 'user-1', graphSlug: 'onboarding' };
const graph = { nodes: () => [], neighbours: () => [] } as never;
const now = { instant: new Date('2026-07-05T12:00:00Z'), timeZone: 'UTC' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPublishedGraph).mockResolvedValue(graph);
  vi.mocked(getJourney).mockResolvedValue({ id: 'journey-1' } as never);
  vi.mocked(getNodeStates).mockResolvedValue([] as never);
  vi.mocked(getSlotHeads).mockResolvedValue([] as never);
  vi.mocked(resolveJourneyNow).mockResolvedValue(now);
  vi.mocked(listModules).mockResolvedValue([] as never);
  vi.mocked(getAllFlags).mockResolvedValue([] as never);
});

describe('assembleJourneyContext', () => {
  it('returns null when there is no published map (no read attempted)', async () => {
    vi.mocked(getPublishedGraph).mockResolvedValue(null);
    expect(await assembleJourneyContext(viewer, key)).toBeNull();
    expect(getJourney).not.toHaveBeenCalled();
  });

  it('returns null when the journey has not started', async () => {
    vi.mocked(getJourney).mockResolvedValue(null);
    expect(await assembleJourneyContext(viewer, key)).toBeNull();
    expect(getNodeStates).not.toHaveBeenCalled();
  });

  it('propagates a ForbiddenError from the canRead-guarded journey read (no slot read)', async () => {
    vi.mocked(getJourney).mockRejectedValue(new Error('Not permitted to read this journey'));
    await expect(assembleJourneyContext(viewer, key)).rejects.toThrow('Not permitted');
    expect(getSlotHeads).not.toHaveBeenCalled();
  });

  it('builds the module-liveness map from the flag rows and returns a well-formed input', async () => {
    vi.mocked(listModules).mockResolvedValue([
      {
        slug: 'live-mod',
        status: 'active',
        featureFlagName: null,
        availableFrom: null,
        availableUntil: null,
      },
      {
        slug: 'flagged-off',
        status: 'active',
        featureFlagName: 'BETA',
        availableFrom: null,
        availableUntil: null,
      },
    ] as never);
    vi.mocked(getAllFlags).mockResolvedValue([{ name: 'BETA', enabled: false }] as never);

    const ctx = await assembleJourneyContext(viewer, key);
    expect(ctx).not.toBeNull();
    const liveness = ctx!.availabilityInput.moduleLiveness;
    expect(liveness.get('live-mod')).toEqual({ live: true });
    expect(liveness.get('flagged-off')).toEqual({ live: false, reason: 'flag' });
    expect(ctx!.availabilityInput).toMatchObject({ graph, now: now.instant });
    expect(getNodeStates).toHaveBeenCalledWith(
      viewer,
      { journeyId: 'journey-1', subject: 'user-1' },
      undefined
    );
  });
});

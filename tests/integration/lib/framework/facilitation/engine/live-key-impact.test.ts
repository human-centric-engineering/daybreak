/**
 * `checkLiveKeyImpact` (f-engine t-4) — the live-key-removal warning. Mocks
 * `@/lib/db/client` (no live DB). Proves it warns per removed key that journeys hold
 * live state on, and stays silent when nothing is removed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { userNodeState: { groupBy: vi.fn() } },
}));

import { checkLiveKeyImpact } from '@/lib/framework/facilitation/engine/live-key-impact';
import { prisma } from '@/lib/db/client';
import type { MapDefinition, MapNode } from '@/lib/framework/facilitation/map/schema';

const node = (key: string): MapNode => ({ key, type: 'milestone', completionMode: 'once' });
const def = (keys: string[]): MapDefinition => ({ nodes: keys.map(node), edges: [] });

beforeEach(() => vi.clearAllMocks());

describe('checkLiveKeyImpact', () => {
  it('warns per removed key that journeys hold live state on', async () => {
    vi.mocked(prisma.userNodeState.groupBy).mockResolvedValue([
      { nodeKey: 'lesson', _count: { _all: 3 } },
    ] as never);

    const warnings = await checkLiveKeyImpact('main', def(['intro', 'lesson']), def(['intro']));

    expect(warnings).toEqual([
      {
        code: 'LIVE_KEY_REMOVED',
        nodeKey: 'lesson',
        liveJourneyCount: 3,
        message: 'Removing node "lesson" would orphan live state in 3 journey(s).',
      },
    ]);
    expect(prisma.userNodeState.groupBy).toHaveBeenCalledWith({
      by: ['nodeKey'],
      where: {
        journey: { graphSlug: 'main' },
        nodeKey: { in: ['lesson'] },
        status: { not: 'unvisited' },
      },
      _count: { _all: true },
    });
  });

  it('returns [] without a query when no key is removed', async () => {
    const warnings = await checkLiveKeyImpact('main', def(['a', 'b']), def(['a', 'b', 'c']));
    expect(warnings).toEqual([]);
    expect(prisma.userNodeState.groupBy).not.toHaveBeenCalled();
  });

  it('returns [] when a removed key has no live state', async () => {
    vi.mocked(prisma.userNodeState.groupBy).mockResolvedValue([] as never);
    const warnings = await checkLiveKeyImpact('main', def(['a', 'gone']), def(['a']));
    expect(warnings).toEqual([]);
  });
});

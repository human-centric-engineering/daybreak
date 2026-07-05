/**
 * `getPublishedGraph` (f-engine t-1) — the DB-bound loader that binds a GraphStore
 * to a slug's live published map.
 *
 * Mocks the map version-service so `getPublishedMap` is stubbed and no real DB (or
 * `@/lib/db/client`) is loaded — house style, no live DB in vitest. Proves the two
 * paths: no published version → `null`; a published map → a store over its
 * definition.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/map/version-service', () => ({
  getPublishedMap: vi.fn(),
}));

import { getPublishedGraph } from '@/lib/framework/facilitation/engine/published-graph';
import { getPublishedMap } from '@/lib/framework/facilitation/map/version-service';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';

beforeEach(() => vi.clearAllMocks());

describe('getPublishedGraph', () => {
  it('returns null when the map has no published version', async () => {
    vi.mocked(getPublishedMap).mockResolvedValue(null);
    await expect(getPublishedGraph('ghost')).resolves.toBeNull();
    expect(getPublishedMap).toHaveBeenCalledWith('ghost');
  });

  it('wraps the published definition in a working GraphStore', async () => {
    const definition: MapDefinition = {
      nodes: [
        { key: 'a', type: 'milestone', completionMode: 'once' },
        { key: 'b', type: 'milestone', completionMode: 'once' },
      ],
      edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
    };
    vi.mocked(getPublishedMap).mockResolvedValue({ slug: 'main', version: 3, definition });

    const store = await getPublishedGraph('main');
    expect(store).not.toBeNull();
    expect(store!.nodes().map((n) => n.key)).toEqual(['a', 'b']);
    expect([...store!.reachableFrom('a')]).toEqual(['b']);
  });
});

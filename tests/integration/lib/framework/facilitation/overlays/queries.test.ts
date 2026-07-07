/**
 * Node-embedding read queries (f-overlays t-1). Mocks the DB client; proves the count is scoped to the
 * (graphSlug, version) pair.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { frameworkNodeEmbedding: { count: vi.fn() } } }));

import { countNodeEmbeddings } from '@/lib/framework/facilitation/overlays/queries';
import { prisma } from '@/lib/db/client';

beforeEach(() => vi.clearAllMocks());

describe('countNodeEmbeddings', () => {
  it('counts rows for the given graph slug and version', async () => {
    vi.mocked(prisma.frameworkNodeEmbedding.count).mockResolvedValue(7);
    const n = await countNodeEmbeddings('primary', 4);
    expect(n).toBe(7);
    expect(prisma.frameworkNodeEmbedding.count).toHaveBeenCalledWith({
      where: { graphSlug: 'primary', version: 4 },
    });
  });
});

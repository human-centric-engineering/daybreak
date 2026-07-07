/**
 * Node-embedding read queries (f-overlays t-1/t-2). Mocks the DB client; proves the count is scoped to
 * the (graphSlug, version) pair, and the similarity query's params + row mapping.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { frameworkNodeEmbedding: { count: vi.fn() }, $queryRawUnsafe: vi.fn() },
}));

import {
  countNodeEmbeddings,
  findRelatedNodes,
} from '@/lib/framework/facilitation/overlays/queries';
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

describe('findRelatedNodes', () => {
  it('passes the key/version/threshold/limit params and maps rows to node keys', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ nodeKey: 'b' }, { nodeKey: 'c' }]);

    const related = await findRelatedNodes('primary', 4, 'a', 3, 0.6);
    expect(related).toEqual(['b', 'c']);

    const call = vi.mocked(prisma.$queryRawUnsafe).mock.calls[0];
    // SQL is a self-join over the same (graphSlug, version), cosine <=>, self-excluded, threshold-gated.
    expect(call[0]).toContain('<=>');
    expect(call[0]).toContain('"nodeKey" <> s."nodeKey"');
    expect(call.slice(1)).toEqual(['primary', 4, 'a', 0.6, 3]); // $1..$5
  });

  it('returns [] when the node has no neighbours within the threshold', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);
    expect(await findRelatedNodes('primary', 4, 'lonely', 3, 0.6)).toEqual([]);
  });
});

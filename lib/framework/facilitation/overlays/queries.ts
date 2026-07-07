/**
 * Node-embedding read queries (f-overlays t-1) — the read side of `framework_node_embedding`, split
 * from the sync service the way the other framework domains split queries from their service. The
 * similarity query (`findRelatedNodes`) arrives with t-2; t-1 ships only the count used by the admin
 * status endpoint and tests.
 */

import { prisma } from '@/lib/db/client';

/** How many node embeddings are stored for a given published map version. */
export async function countNodeEmbeddings(graphSlug: string, version: number): Promise<number> {
  return prisma.frameworkNodeEmbedding.count({ where: { graphSlug, version } });
}

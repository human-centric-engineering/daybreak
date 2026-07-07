/**
 * Node-embedding read queries (f-overlays) — the read side of `framework_node_embedding`, split from
 * the sync service the way the other framework domains split queries from their service. `countNodeEmbeddings`
 * (t-1) is the admin-status/short-circuit read; `findRelatedNodes` (t-2) is the advisory similarity query.
 */

import { prisma } from '@/lib/db/client';

/** How many node embeddings are stored for a given published map version. */
export async function countNodeEmbeddings(graphSlug: string, version: number): Promise<number> {
  return prisma.frameworkNodeEmbedding.count({ where: { graphSlug, version } });
}

/**
 * The `limit` nodes most similar to `nodeKey` within the SAME published map version, nearest first, by
 * pgvector cosine distance (`<=>`) — the advisory "related places" source (t-2). Self-join over
 * `framework_node_embedding`: both operands are stored vectors from the same sync run (one model, the
 * fixed `vector(1536)` column), so there is no fresh query embedding and the knowledge-search
 * model/dimension drift-guard does not apply. Excludes the node itself and gates on `maxDistance` so a
 * node with no genuine neighbour returns fewer (or none) rather than the "least dissimilar" node. Ties
 * break by `nodeKey` ascending so the advisory output is reproducible (matching `ranking.ts`). F9: this
 * is read strictly into the advisory overlay — it never touches eligibility. Returns `[]` when the node
 * has no embedding row (graceful).
 */
export async function findRelatedNodes(
  graphSlug: string,
  version: number,
  nodeKey: string,
  limit: number,
  maxDistance: number
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ nodeKey: string }>>(
    `SELECT o."nodeKey" AS "nodeKey"
       FROM framework_node_embedding s
       JOIN framework_node_embedding o
         ON o."graphSlug" = s."graphSlug"
        AND o."version" = s."version"
        AND o."nodeKey" <> s."nodeKey"
      WHERE s."graphSlug" = $1 AND s."version" = $2 AND s."nodeKey" = $3
        AND (o.embedding <=> s.embedding) < $4
      ORDER BY (o.embedding <=> s.embedding) ASC, o."nodeKey" ASC
      LIMIT $5`,
    graphSlug,
    version,
    nodeKey,
    maxDistance,
    limit
  );
  return rows.map((r) => r.nodeKey);
}

-- f-overlays t-1 — per-node embeddings of an authored facilitation map (framework-tier).
-- Touches only framework_* tables (boundary CI). Hand-authored (not `migrate dev` output) so the
-- pgvector column + HNSW index are written directly: Prisma models the table from the schema's
-- `Unsupported("vector(1536)")`, but it cannot emit a `USING hnsw` index, so that is appended by hand
-- (the `AiMessageEmbedding` / `AiKnowledgeChunk` baseline pattern). No spurious pgvector/tsvector
-- `DROP INDEX` here because this migration was hand-authored rather than diffed (B13).
-- The `vector` extension already exists (baseline); do not re-create it.

-- CreateTable
CREATE TABLE "framework_node_embedding" (
    "id" TEXT NOT NULL,
    "graphSlug" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "embeddingModel" TEXT,
    "embeddingProvider" TEXT,
    "embeddingDimension" INTEGER,
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_node_embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_node_embedding_graphSlug_nodeKey_version_key" ON "framework_node_embedding"("graphSlug", "nodeKey", "version");

-- CreateIndex
CREATE INDEX "framework_node_embedding_graphSlug_version_idx" ON "framework_node_embedding"("graphSlug", "version");

-- CreateIndex — HNSW (pgvector). Prisma-unmodelled; hand-written. Probed by the framework drift
-- bridge (lib/framework/db-drift.ts → idx_framework_node_embedding). Cosine ops match the query's `<=>`.
CREATE INDEX "idx_framework_node_embedding" ON "framework_node_embedding" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);

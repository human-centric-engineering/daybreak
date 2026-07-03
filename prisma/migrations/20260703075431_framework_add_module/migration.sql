-- f-module-core t-1 — the first framework table.
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's
-- schema-diff also emitted DROP statements for raw-SQL objects it cannot model
-- (the pgvector HNSW indexes `idx_knowledge_embedding` / `idx_message_embedding`,
-- the tsvector GIN index `idx_ai_knowledge_chunk_search_vector`, and the
-- `ai_knowledge_chunk.searchVector` default); those are unrelated to this change
-- and have been stripped, per `.context/database/prisma-unmodelled-objects.md`.

-- CreateTable
CREATE TABLE "framework_module" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "featureFlagName" TEXT,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "audience" TEXT NOT NULL DEFAULT 'all',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isRegistered" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_module_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_module_slug_key" ON "framework_module"("slug");

-- CreateIndex
CREATE INDEX "framework_module_status_idx" ON "framework_module"("status");

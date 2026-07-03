-- f-slots t-1 — slot definitions (the authored "what to learn" half of Data-Slots).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's
-- schema-diff also emitted DROP statements for raw-SQL objects it cannot model
-- (the pgvector HNSW indexes `idx_knowledge_embedding` / `idx_message_embedding`,
-- the tsvector GIN index `idx_ai_knowledge_chunk_search_vector`, and the
-- `ai_knowledge_chunk.searchVector` default); those are unrelated to this change
-- and have been stripped, per `.context/database/prisma-unmodelled-objects.md`.

-- CreateTable
CREATE TABLE "framework_slot_definition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "visibility" TEXT NOT NULL DEFAULT 'open',
    "mode" TEXT NOT NULL DEFAULT 'targeted',
    "dataType" TEXT NOT NULL DEFAULT 'text',
    "sensitivity" TEXT NOT NULL DEFAULT 'standard',
    "priorityWeight" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_slot_definition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_slot_definition_slug_key" ON "framework_slot_definition"("slug");

-- CreateIndex
CREATE INDEX "framework_slot_definition_group_scope_idx" ON "framework_slot_definition"("group", "scope");

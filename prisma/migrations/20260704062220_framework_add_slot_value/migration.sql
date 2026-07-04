-- f-slots t-2 — slot values (the insert-only, versioned user-data half of Data-Slots).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's
-- schema-diff also emitted DROP statements for raw-SQL objects it cannot model
-- (the pgvector HNSW indexes `idx_knowledge_embedding` / `idx_message_embedding`,
-- the tsvector GIN index `idx_ai_knowledge_chunk_search_vector`, and the
-- `ai_knowledge_chunk.searchVector` default); those are unrelated to this change
-- and have been stripped, per `.context/database/prisma-unmodelled-objects.md`.
--
-- The `userId` FK + `ON DELETE CASCADE` are HAND-WRITTEN below: `SlotValue.userId`
-- is a plain scalar (no Prisma `@relation`, so a fork table never edits the core
-- `User` model), which means Prisma does not emit the constraint. The cascade is
-- what makes `eraseUser()` erase these rows (spec §6.4; `.context/privacy/data-erasure.md`).
-- The migration-drift check flags this line as "extra" — expected for the fork-table pattern.

-- CreateTable
CREATE TABLE "framework_slot_value" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotSlug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "valueJson" JSONB,
    "confidence" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "reasoningNote" TEXT NOT NULL,
    "provenance" JSONB NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_slot_value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_slot_value_userId_capturedAt_idx" ON "framework_slot_value"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "framework_slot_value_userId_slotSlug_version_key" ON "framework_slot_value"("userId", "slotSlug", "version");

-- AddForeignKey (hand-written — plain scalar FK to core `user` table, personal data → CASCADE).
-- The core `User` model maps to table "user" (auth.prisma `@@map("user")`).
ALTER TABLE "framework_slot_value"
  ADD CONSTRAINT "framework_slot_value_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

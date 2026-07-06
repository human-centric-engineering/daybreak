-- f-module-bindings t-4 — a module's durable knowledge scope (spec §4.2). Two thin
-- pivots mirroring the core per-agent grant pivots: a module owns a set of documents
-- and tags; its bound agents inherit search access, unioned live by the core
-- access-contributor seam (no materialisation).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's schema-diff
-- also emitted the following, and they have been STRIPPED here (the B13 footgun —
-- `.context/database/prisma-unmodelled-objects.md`):
--   • DROP CONSTRAINT for every hand-written FK Prisma can't model — the erasure
--     cascades on `framework_journey_event` / `framework_slot_value` /
--     `framework_user_journey`, the t-1 `framework_module_agent.agentId → ai_agent`
--     cascade, and the t-3 `framework_module_workflow` FKs (`workflowId → ai_workflow`,
--     `createdBy → user`). Prisma re-proposes dropping every hand-FK on every framework
--     migration. Dropping the erasure FKs would be a silent GDPR regression; dropping
--     the t-1/t-3 FKs would orphan bindings. KEPT by omission.
--   • DROP INDEX for the raw-SQL pgvector HNSW / tsvector GIN objects and the
--     `ai_knowledge_chunk.searchVector` default — unmodelled, unrelated to this change.
--
-- `documentId` / `tagId` FKs are HAND-WRITTEN below: both are plain scalars (no Prisma
-- `@relation`, so a fork table never adds a reverse field to the core
-- `AiKnowledgeDocument` / `KnowledgeTag` models — X6 boundary), so Prisma does not emit
-- the constraint. They map to tables "ai_knowledge_document" / "knowledge_tag". The
-- `moduleId` FKs ARE Prisma relations (both framework-owned), emitted normally.

-- CreateTable
CREATE TABLE "framework_module_knowledge_document" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_module_knowledge_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_module_knowledge_tag" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_module_knowledge_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_module_knowledge_document_documentId_idx" ON "framework_module_knowledge_document"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "framework_module_knowledge_document_moduleId_documentId_key" ON "framework_module_knowledge_document"("moduleId", "documentId");

-- CreateIndex
CREATE INDEX "framework_module_knowledge_tag_tagId_idx" ON "framework_module_knowledge_tag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "framework_module_knowledge_tag_moduleId_tagId_key" ON "framework_module_knowledge_tag"("moduleId", "tagId");

-- AddForeignKey
ALTER TABLE "framework_module_knowledge_document" ADD CONSTRAINT "framework_module_knowledge_document_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "framework_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_module_knowledge_tag" ADD CONSTRAINT "framework_module_knowledge_tag_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "framework_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (hand-written — plain scalar FK to core `ai_knowledge_document`; delete a document, its module grants go).
ALTER TABLE "framework_module_knowledge_document"
  ADD CONSTRAINT "framework_module_knowledge_document_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ai_knowledge_document"("id") ON DELETE CASCADE;

-- AddForeignKey (hand-written — plain scalar FK to core `knowledge_tag`; delete a tag, its module grants go).
ALTER TABLE "framework_module_knowledge_tag"
  ADD CONSTRAINT "framework_module_knowledge_tag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "knowledge_tag"("id") ON DELETE CASCADE;

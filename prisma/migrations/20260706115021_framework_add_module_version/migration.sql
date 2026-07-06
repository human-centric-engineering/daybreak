-- f-module-config t-1 — a module's config version history (spec §4.1, decision A10).
-- A point-in-time snapshot table mirroring `ai_agent_version`: every operator config
-- save writes one `framework_module_version` capturing `framework_module.config` as of
-- that save, so history is first-class and a prior config can be restored. There is no
-- draft/published pointer — the live values stay on `framework_module.config`.
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's schema-diff
-- also emitted the following, and they have been STRIPPED here (the B13 footgun —
-- `.context/database/prisma-unmodelled-objects.md`):
--   • DROP CONSTRAINT for every hand-written FK Prisma can't model — the erasure
--     cascades on `framework_journey_event` / `framework_slot_value` /
--     `framework_user_journey`, the `framework_module_agent.agentId → ai_agent` cascade
--     (t-1), and the `framework_module_workflow` FKs (`workflowId → ai_workflow`,
--     `createdBy → user`, t-3), plus the `framework_module_knowledge_*` document/tag FKs
--     (t-4). Prisma re-proposes dropping every hand-FK on every framework migration;
--     dropping the erasure FKs would be a silent GDPR regression and dropping the others
--     would orphan rows. KEPT by omission.
--   • DROP INDEX for the raw-SQL pgvector HNSW / tsvector GIN objects and the
--     `ai_knowledge_chunk.searchVector` default — unmodelled, unrelated to this change.
--
-- `createdBy` is HAND-WRITTEN below: a plain scalar (no Prisma `@relation`, so a fork
-- table never adds a reverse field to the core `User` model — X6 boundary), so Prisma
-- does not emit the constraint. `User` maps to "user". `moduleId` IS a Prisma relation
-- (framework-owned), emitted normally. `ON DELETE SET NULL` on `createdBy` retains a
-- version when its author is erased (config history is audit that outlives its author,
-- the CLAUDE.md retained-config policy — mirroring `framework_module_workflow.createdBy`).

-- CreateTable
CREATE TABLE "framework_module_version" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_module_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_module_version_moduleId_idx" ON "framework_module_version"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "framework_module_version_moduleId_version_key" ON "framework_module_version"("moduleId", "version");

-- AddForeignKey
ALTER TABLE "framework_module_version" ADD CONSTRAINT "framework_module_version_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "framework_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (hand-written — plain scalar FK to core `user`; retain the version when its author is erased).
ALTER TABLE "framework_module_version"
  ADD CONSTRAINT "framework_module_version_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL;

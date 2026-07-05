-- f-module-bindings t-3 — ModuleWorkflowBinding (bind a module lifecycle event to a
-- published workflow, spec §4.2). Mirrors `AiWorkflowTrigger`: a trigger row whose
-- dispatch (`runModuleWorkflowBindings`) reuses the existing execution machinery.
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's schema-diff
-- also emitted the following, and they have been STRIPPED here (the B13 footgun —
-- `.context/database/prisma-unmodelled-objects.md`):
--   • DROP CONSTRAINT for the hand-written FKs Prisma can't model — the erasure
--     cascades on `framework_journey_event` / `framework_slot_value` /
--     `framework_user_journey` (what make `eraseUser()` erase framework rows) AND the
--     t-1 `framework_module_agent.agentId → ai_agent` cascade. Prisma re-proposes
--     dropping every hand-FK on every framework migration. Dropping the erasure FKs
--     would be a silent GDPR regression; dropping the t-1 FK would orphan agent
--     bindings. KEPT by omission.
--   • DROP INDEX for the raw-SQL pgvector HNSW / tsvector GIN objects and the
--     `ai_knowledge_chunk.searchVector` default — unmodelled, unrelated to this change.
--
-- `workflowId` and `createdBy` FKs are HAND-WRITTEN below: both are plain scalars (no
-- Prisma `@relation`, so a fork table never adds a reverse field to the core
-- `AiWorkflow` / `User` models — X6 boundary), so Prisma does not emit the constraint.
-- `AiWorkflow` maps to "ai_workflow", `User` maps to "user". `moduleId` IS a Prisma
-- relation (both framework-owned), so its FK is emitted normally.

-- CreateTable
CREATE TABLE "framework_module_workflow" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "inputTemplate" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_module_workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_module_workflow_moduleId_idx" ON "framework_module_workflow"("moduleId");

-- CreateIndex
CREATE INDEX "framework_module_workflow_workflowId_idx" ON "framework_module_workflow"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "framework_module_workflow_moduleId_eventType_workflowId_key" ON "framework_module_workflow"("moduleId", "eventType", "workflowId");

-- AddForeignKey
ALTER TABLE "framework_module_workflow" ADD CONSTRAINT "framework_module_workflow_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "framework_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (hand-written — plain scalar FK to core `ai_workflow`; delete a workflow, its bindings go).
ALTER TABLE "framework_module_workflow"
  ADD CONSTRAINT "framework_module_workflow_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "ai_workflow"("id") ON DELETE CASCADE;

-- AddForeignKey (hand-written — plain scalar FK to core `user`; retain the binding on author erasure).
ALTER TABLE "framework_module_workflow"
  ADD CONSTRAINT "framework_module_workflow_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL;

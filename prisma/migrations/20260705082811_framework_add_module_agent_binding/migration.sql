-- f-module-bindings t-1 — ModuleAgentBinding (bind an AiAgent into a module seat, A6).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Prisma's schema-diff
-- also emitted, and they have been STRIPPED here:
--   • DROP CONSTRAINT for the hand-written erasure FKs on `framework_journey_event`,
--     `framework_slot_value`, and `framework_user_journey` — those cascades are what
--     make `eraseUser()` erase framework rows (f-slots / f-journey-state); Prisma
--     re-proposes dropping them on every framework migration because it can't model a
--     hand-FK. Dropping them would be a silent GDPR regression. KEPT by omission.
--   • DROP INDEX for the raw-SQL pgvector HNSW / tsvector GIN objects and the
--     `ai_knowledge_chunk.searchVector` default — unmodelled, unrelated to this change
--     (`.context/database/prisma-unmodelled-objects.md`, B13).
--
-- `agentId` FK + `ON DELETE CASCADE` are HAND-WRITTEN below: `ModuleAgentBinding.agentId`
-- is a plain scalar (no Prisma `@relation`, so a fork table never adds a reverse field
-- to the core `AiAgent` model — X6 boundary), so Prisma does not emit the constraint.
-- The core `AiAgent` model maps to table "ai_agent". `moduleId` IS a Prisma relation
-- (both framework-owned), so its FK is emitted normally.

-- CreateTable
CREATE TABLE "framework_module_agent" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_module_agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_module_agent_moduleId_idx" ON "framework_module_agent"("moduleId");

-- CreateIndex
CREATE INDEX "framework_module_agent_agentId_idx" ON "framework_module_agent"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "framework_module_agent_moduleId_agentId_role_key" ON "framework_module_agent"("moduleId", "agentId", "role");

-- AddForeignKey
ALTER TABLE "framework_module_agent" ADD CONSTRAINT "framework_module_agent_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "framework_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (hand-written — plain scalar FK to core `ai_agent`; delete an agent, its bindings go).
ALTER TABLE "framework_module_agent"
  ADD CONSTRAINT "framework_module_agent_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE;

-- f-facilitation-agents t-1 — FacilitationAgentBinding (bind an AiAgent to a facilitation seat).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). `agentId` FK + `ON DELETE
-- CASCADE` are HAND-WRITTEN below: `FacilitationAgentBinding.agentId` is a plain scalar (no
-- Prisma `@relation`, so a fork table never adds a reverse field to the core `AiAgent` model
-- — X6 boundary), so Prisma does not emit the constraint. The core `AiAgent` model maps to
-- table "ai_agent". `role` is a normal `@@unique` (one agent per facilitation seat) — Prisma
-- models it. No `userId` → not user data, so no hand-FK erasure cascade (unlike
-- `framework_slot_value` / `framework_journey_event`); this table holds admin config.

-- CreateTable
CREATE TABLE "framework_facilitation_agent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_facilitation_agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_facilitation_agent_role_key" ON "framework_facilitation_agent"("role");

-- CreateIndex
CREATE INDEX "framework_facilitation_agent_agentId_idx" ON "framework_facilitation_agent"("agentId");

-- AddForeignKey (hand-written — plain scalar FK to core `ai_agent`; delete an agent, its facilitation bindings go).
ALTER TABLE "framework_facilitation_agent"
  ADD CONSTRAINT "framework_facilitation_agent_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE CASCADE;

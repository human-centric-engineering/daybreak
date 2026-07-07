-- f-eval t-1 — FrameworkConversationEval (per-turn eval of a framework conversation, spec §5.5 F14).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). The `messageId` FK to core
-- `"ai_message"` with `ON DELETE CASCADE` is HAND-WRITTEN: it is a plain scalar FK (no Prisma
-- `@relation`, so a fork table never adds a reverse field to the Sunrise-owned `AiMessage` — X6), and
-- CASCADE means an eval row is erased with its message (which itself cascades from the conversation →
-- user), keeping it GDPR-clean with no separate erasure hook. The core `AiMessage` model maps to
-- table "ai_message". `@@unique([messageId])` is a normal unique index (one eval per turn) — Prisma
-- models it. No `userId` column: the row is keyed on the conversation/message, not a user.

-- CreateTable
CREATE TABLE "framework_conversation_eval" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT,
    "faithfulness" DOUBLE PRECISION,
    "groundedness" DOUBLE PRECISION,
    "relevance" DOUBLE PRECISION,
    "judgeReasoning" JSONB,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supervisorReport" JSONB,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_conversation_eval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_conversation_eval_messageId_key" ON "framework_conversation_eval"("messageId");

-- CreateIndex
CREATE INDEX "framework_conversation_eval_conversationId_idx" ON "framework_conversation_eval"("conversationId");

-- CreateIndex
CREATE INDEX "framework_conversation_eval_contextType_contextId_idx" ON "framework_conversation_eval"("contextType", "contextId");

-- AddForeignKey (hand-written — plain scalar FK to core "ai_message"; delete a message, its eval goes)
ALTER TABLE "framework_conversation_eval"
  ADD CONSTRAINT "framework_conversation_eval_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ai_message"("id") ON DELETE CASCADE;

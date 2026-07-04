-- Framework — journey state (f-journey-state t-1). Per-user runtime traversal of an
-- authored map: `UserJourney` + the `UserNodeState` projection + the insert-only
-- `JourneyEvent` log (spec §5.2). Touches only `framework_*` tables.
--
-- Hand-authored to match Prisma's generated DDL (modelled on the `framework_add_slot_value`
-- and `framework_add_facilitation_graph` migrations) rather than via `prisma migrate dev`,
-- so it carries NO spurious pgvector/tsvector `DROP`s to strip (the documented migrate-dev
-- footgun; see .context/database/prisma-unmodelled-objects.md).
--
-- Two `userId` FKs are HAND-WRITTEN below (`framework_user_journey`, `framework_journey_event`):
-- both are plain scalar FKs to core `User` (no Prisma `@relation`, so a fork table never edits
-- the Sunrise-owned `User` model), `ON DELETE CASCADE`, referencing the core table's `@@map`
-- name "user" (NOT the model name "User" — the latter fails at apply; auth.prisma `@@map("user")`).
-- These are what make `eraseUser()` erase journey + engagement rows (spec §11;
-- .context/privacy/data-erasure.md). The migration-drift/`migrate dev` diff flags these two
-- lines as "extra" — expected for the fork-table satellite pattern. Apply with
-- `db:migrate:deploy` (not `migrate dev`, which reads the un-modelled FKs as drift).
--
-- `framework_journey_event` intentionally has TWO cascade paths converging on it: the `userId`
-- hand-FK (CASCADE — erases every event when the user is erased) and the optional `journeyId`
-- Prisma FK (SET NULL — a removed journey nulls a journey-scoped event's link). Both are correct
-- in Postgres; user-erasure reaches every row via `userId`.

-- CreateTable
CREATE TABLE "framework_user_journey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "graphSlug" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_user_journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_user_node_state" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timesCompleted" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB,
    "firstEnteredAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "framework_user_node_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_journey_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "nodeKey" TEXT,
    "moduleSlug" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_journey_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_user_journey_userId_graphSlug_contextKey_key" ON "framework_user_journey"("userId", "graphSlug", "contextKey");

-- CreateIndex
CREATE UNIQUE INDEX "framework_user_node_state_journeyId_nodeKey_key" ON "framework_user_node_state"("journeyId", "nodeKey");

-- CreateIndex
CREATE INDEX "framework_journey_event_userId_occurredAt_idx" ON "framework_journey_event"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "framework_journey_event_journeyId_occurredAt_idx" ON "framework_journey_event"("journeyId", "occurredAt");

-- AddForeignKey (Prisma-modelled internal edge — the node-state projection)
ALTER TABLE "framework_user_node_state" ADD CONSTRAINT "framework_user_node_state_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "framework_user_journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (Prisma-modelled internal edge — optional journey link on events; SET NULL)
ALTER TABLE "framework_journey_event" ADD CONSTRAINT "framework_journey_event_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "framework_user_journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (HAND-WRITTEN — plain scalar FK to core `user`, personal data → CASCADE).
-- Not emitted by Prisma (no `@relation`). References the `@@map` name "user", not "User".
ALTER TABLE "framework_user_journey"
  ADD CONSTRAINT "framework_user_journey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- AddForeignKey (HAND-WRITTEN — erasure path for EVERY journey event, incl. non-journey ones).
ALTER TABLE "framework_journey_event"
  ADD CONSTRAINT "framework_journey_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

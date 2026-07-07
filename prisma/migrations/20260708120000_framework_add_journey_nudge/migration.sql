-- f-overlays t-3b — proactive-guidance nudge throttle (framework-tier). Touches only framework_*
-- tables (boundary CI). Hand-authored: the `journeyId` FK to framework_user_journey is a Prisma
-- @relation, but the `userId` FK to the Sunrise-owned `user` table is hand-written (no @relation, X6),
-- so the whole migration is authored by hand for clarity. No pgvector/tsvector objects here → no
-- spurious DROP to strip (B13).

-- CreateTable
CREATE TABLE "framework_journey_nudge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "nudgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_journey_nudge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_journey_nudge_journeyId_key" ON "framework_journey_nudge"("journeyId");

-- CreateIndex
CREATE INDEX "framework_journey_nudge_userId_idx" ON "framework_journey_nudge"("userId");

-- AddForeignKey (Prisma @relation → framework_user_journey; the throttle row dies with its journey)
ALTER TABLE "framework_journey_nudge"
  ADD CONSTRAINT "framework_journey_nudge_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "framework_user_journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (hand-written FK → core "user"; the direct GDPR erasure path, no Prisma @relation, X6)
ALTER TABLE "framework_journey_nudge"
  ADD CONSTRAINT "framework_journey_nudge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

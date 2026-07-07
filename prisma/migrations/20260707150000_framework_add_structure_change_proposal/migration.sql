-- f-emergence t-2 — StructureChangeProposal (the emergence proposal pipeline's store, spec §5.5 F17).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Three objects Prisma can't model are
-- HAND-WRITTEN: (1) the `subjectType` CHECK (v1 = 'map' only; module_config/policy are an additive
-- later scope — extend the IN-list then). (2) the `status` CHECK (the §546 closed-vocab pattern for
-- the proposal state machine). (3) the `reviewedBy` FK to core `"user"` with `ON DELETE SET NULL` — a
-- plain scalar FK, no Prisma `@relation` (X6), retained audit on the approving admin's erasure.
-- `createdBy` is NOT an FK: it holds `"agent:<slug>"` or a user id (agent authorship, F17), mirroring
-- `framework_facilitation_graph_version.createdBy`. The core `User` model maps to table "user".

-- CreateTable
CREATE TABLE "framework_structure_change_proposal" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "baseVersion" INTEGER,
    "proposedDefinition" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "riskClass" TEXT NOT NULL DEFAULT 'unclassified',
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_structure_change_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_scp_subject_status_idx" ON "framework_structure_change_proposal"("subjectType", "subjectId", "status");

-- CreateIndex
CREATE INDEX "framework_scp_status_idx" ON "framework_structure_change_proposal"("status");

-- subjectType vocabulary CHECK (hand-written — v1 = 'map'; later subjects extend the IN-list)
ALTER TABLE "framework_structure_change_proposal"
  ADD CONSTRAINT "framework_structure_change_proposal_subjectType_check"
  CHECK ("subjectType" IN ('map'));

-- status vocabulary CHECK (hand-written — the proposal state machine)
ALTER TABLE "framework_structure_change_proposal"
  ADD CONSTRAINT "framework_structure_change_proposal_status_check"
  CHECK ("status" IN ('pending', 'approved', 'rejected', 'published'));

-- AddForeignKey (hand-written — plain scalar FK to core "user"; SET NULL retains the proposal on the reviewer's erasure)
ALTER TABLE "framework_structure_change_proposal"
  ADD CONSTRAINT "framework_structure_change_proposal_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "user"("id") ON DELETE SET NULL;

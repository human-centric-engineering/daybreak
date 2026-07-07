-- f-policies t-1 — FacilitationPolicy (the typed governance-policy kinds, spec §5.5).
--
-- Scoped to `framework_*` only (boundary migration-hygiene CI). Two objects Prisma can't model
-- are HAND-WRITTEN: (1) the `kind` CHECK constraint — the §546 free-string-plus-CHECK pattern for
-- a closed framework vocabulary; later policy kinds (t-2 relevance_gating, t-3 guard_minimum, t-4
-- escalation) DROP + re-ADD this constraint to extend the IN-list. (2) the `createdBy` FK to core
-- `"user"` with `ON DELETE SET NULL` — a plain scalar FK, no Prisma `@relation`, so a fork table
-- never adds a reverse field to the Sunrise-owned `User` (X6); a policy is retained-config audit
-- that outlives its author's erasure (SET NULL, not cascade), mirroring
-- `framework_module_version.createdBy`. The core `User` model maps to table "user".

-- CreateTable
CREATE TABLE "framework_facilitation_policy" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_facilitation_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "framework_facilitation_policy_kind_enabled_idx" ON "framework_facilitation_policy"("kind", "enabled");

-- kind vocabulary CHECK (hand-written — a closed framework vocab; later policy kinds extend the IN-list)
ALTER TABLE "framework_facilitation_policy"
  ADD CONSTRAINT "framework_facilitation_policy_kind_check"
  CHECK ("kind" IN ('auto_approval'));

-- AddForeignKey (hand-written — plain scalar FK to core "user"; SET NULL retains the policy on author
-- erasure. `ON DELETE SET NULL` only, matching the framework's hand-FK convention — framework_module_version
-- / framework_module_workflow write the same, no `ON UPDATE CASCADE`).
ALTER TABLE "framework_facilitation_policy"
  ADD CONSTRAINT "framework_facilitation_policy_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL;

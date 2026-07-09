-- f-governance-plus t-1 — widen the structure-change proposal subject vocabulary (spec §5.5 F17).
--
-- f-emergence shipped the proposal pipeline for the `'map'` subject only and left the `subjectType`
-- CHECK pinned to `('map')`, naming `module_config` / `policy` as an additive later scope. This
-- migration widens that CHECK to the full vocabulary so a module-config or policy change can travel
-- the same propose → approve → apply gate. The Prisma field is already a bare `String` (the CHECK is
-- hand-written), so there is NO `schema.prisma` change and no drift — only the constraint moves.
--
-- Scoped to the `framework_*` table only (boundary migration-hygiene CI). DROP-then-ADD because
-- Postgres has no in-place CHECK edit; no indexed/vector columns are touched, so no DROP-strip needed.

ALTER TABLE "framework_structure_change_proposal"
  DROP CONSTRAINT "framework_structure_change_proposal_subjectType_check";

ALTER TABLE "framework_structure_change_proposal"
  ADD CONSTRAINT "framework_structure_change_proposal_subjectType_check"
  CHECK ("subjectType" IN ('map', 'module_config', 'policy'));

-- f-policies t-2 — extend the FacilitationPolicy `kind` vocabulary with `relevance_gating`.
--
-- Scoped to `framework_*` only. The `kind` CHECK is the §546 closed-vocab guard (Prisma can't
-- model a CHECK, so it's hand-written and hand-extended per kind — DROP + re-ADD the IN-list).
-- No column/table change: relevance_gating adds a payload SHAPE (validated in code by
-- `relevanceGatingPayloadSchema`), not a schema column.

ALTER TABLE "framework_facilitation_policy"
  DROP CONSTRAINT "framework_facilitation_policy_kind_check";

ALTER TABLE "framework_facilitation_policy"
  ADD CONSTRAINT "framework_facilitation_policy_kind_check"
  CHECK ("kind" IN ('auto_approval', 'relevance_gating'));

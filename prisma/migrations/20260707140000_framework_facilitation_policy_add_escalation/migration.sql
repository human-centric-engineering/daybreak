-- f-emergence t-1 — extend the FacilitationPolicy `kind` vocabulary with `escalation` (F15).
--
-- Scoped to `framework_*` only. The `kind` CHECK is the §546 closed-vocab guard (Prisma can't model
-- a CHECK, so it's hand-written and hand-extended per kind — DROP + re-ADD the IN-list). No
-- column/table change: escalation adds a payload SHAPE (validated in code by `escalationPayloadSchema`)
-- + a runtime guard-event contributor, not a schema column. Delivers f-policies' deferred escalation
-- kind, built under the f-emergence effort.

ALTER TABLE "framework_facilitation_policy"
  DROP CONSTRAINT "framework_facilitation_policy_kind_check";

ALTER TABLE "framework_facilitation_policy"
  ADD CONSTRAINT "framework_facilitation_policy_kind_check"
  CHECK ("kind" IN ('auto_approval', 'relevance_gating', 'guard_minimum', 'escalation'));

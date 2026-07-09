-- f-governance-plus t-3 — add the framework-rubric judge score to the conversation-eval store.
--
-- The scheduled eval sweep runs a framework-specific rubric judge per scorable turn and persists its
-- 0..1 score here (reasoning goes into the existing `judgeReasoning` Json — "add a column, not a
-- table"). Nullable: existing rows and any turn the rubric pass hasn't scored stay null. Scoped to
-- the `framework_*` table only (boundary migration-hygiene CI); a plain additive column, no index/
-- constraint churn, so no DROP-strip needed.

ALTER TABLE "framework_conversation_eval"
  ADD COLUMN "rubricScore" DOUBLE PRECISION;

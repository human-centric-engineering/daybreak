-- f-governance-plus t-3 — add the framework-rubric judge score + reasoning to the conversation-eval
-- store.
--
-- The scheduled eval sweep runs a framework-specific rubric judge per scorable turn and persists its
-- 0..1 score (`rubricScore`) + reasoning (`rubricReasoning`) here. The reasoning is its OWN column,
-- NOT merged into `judgeReasoning`, so the metric scorer (which overwrites `judgeReasoning`) and the
-- rubric pass never clobber each other and there is no read-modify-write race on a shared JSON blob.
-- Both nullable: existing rows and any turn the rubric pass hasn't scored stay null. Scoped to the
-- `framework_*` table only (boundary migration-hygiene CI); plain additive columns, no index/
-- constraint churn, so no DROP-strip needed.

ALTER TABLE "framework_conversation_eval"
  ADD COLUMN "rubricScore" DOUBLE PRECISION,
  ADD COLUMN "rubricReasoning" JSONB;

-- f-module-bindings t-1 (code-review follow-up) — enforce "≤ 1 primary seat per
-- module" at the DB, not just app-side.
--
-- The bind/update services demote any existing primary before writing a new one, so
-- the *serial* path already keeps a single primary. This partial UNIQUE index closes
-- the concurrency gap: under two simultaneous primary writes each demote runs against
-- committed data and misses the other's in-flight insert, which app logic alone can't
-- prevent. The losing writer now hits a unique violation (mapped to a clean 4xx in
-- `bindings/service.ts` → `rethrowBindingWriteError`) instead of leaving the module
-- with two lead seats — the exact "at most one flagged row per group" shape the
-- codebase already solves with `idx_ai_knowledge_base_single_default`
-- (`.context/database/prisma-unmodelled-objects.md`, A7).
--
-- A partial index (`WHERE …`) is an UNMODELLED object: Prisma can't express it in
-- `schema.prisma`, so a future `prisma migrate dev` on a `framework_*` table will
-- re-propose `DROP INDEX "framework_module_agent_single_primary"`. Strip that DROP
-- (the B13 discipline), the same as the pgvector/tsvector objects and the hand-FKs.

CREATE UNIQUE INDEX "framework_module_agent_single_primary"
  ON "framework_module_agent" ("moduleId")
  WHERE "isPrimary";

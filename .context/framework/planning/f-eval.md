---
name: f-eval
feature: 20 · f-eval
epic: Framework v1
status: in flight (deps f-facilitation-agents + f-guidance shipped ✅) — planned, tasks promoted
owner: John
depends_on: f-facilitation-agents (shipped — the `facilitation`/`module` framework conversations this scores) · f-guidance (shipped — the module surface) · reuses Sunrise-core evals (`scoreResponse` + the existing eval judges, `runSupervisorAssessment`, the `AiMessage` provenance)
spec: framework-architecture.md §5.5 (governance — post-hoc supervision + evaluation over framework conversations) · Appendix A — F14 (governance = existing guards + supervisor/evals + audit/approvals)
parent: plan.md
opened: 2026-07-07
planned: 2026-07-07
---

# f-eval — evaluation wiring over framework conversations

> Feature-level build plan for **`f-eval`** (20). Parent: [[plan#20 · `f-eval`|plan.md]].
> **Split out of [[f-emergence]] (18)** at its close-out. **Build-ready** — reconciliations settled
> against repo reality (a reconnaissance sweep of the scorer / supervisor / message-read / seed
> machinery, 2026-07-07). Sizing: **task = one PR** (~200–600 lines), **2 PRs**.

## Intent

Governance's post-hoc face (spec §5.5, F14 — _reuse over reinvention_): run the existing
named-metric scoring (faithfulness / groundedness / relevance) and, optionally, the post-hoc
**supervisor** over the framework's own conversations (facilitation + module surfaces), feeding the
improvement loop. The scoring/supervision _machinery_ is entirely Sunrise-core; this feature is the
thin **conversation-native adapter** that reads framework conversation turns, runs the existing
scorer over them, and stores the result.

## Reconciliation with repo reality — the design decisions (settled 2026-07-07)

Organising principle: **reuse over reinvention** (F14), **ship nothing a fork has to delete**,
**confirm "pure framework-tier" at build** ([[planning-retro#B17|B17]]).

1. **Metric scoring REUSES the existing core eval judges — no new judge seeds, and the `#303`
   scaffold is NOT built here (the planned "judge seeds" task is dropped).** `scoreResponse`
   ([`evaluations/score-response.ts`](../../lib/orchestration/evaluations/score-response.ts)) is a
   standalone per-Q/A-turn scorer that resolves its three judges by **hard-coded slug**
   (`eval-judge-faithfulness` / `-groundedness` / `-relevance`) — already seeded by core
   `prisma/seeds/016-evaluation-judges.ts` (`isSystem:true`). So f-eval feeds it
   `{ userQuestion, aiResponse, citations, userId }` per framework turn and reuses those judges
   as-is. **The f-emergence-era "judge seeds via the `#303 isSystem:false` scaffold" task is dropped
   for two reasons the recon exposed:** (a) the existing judges already cover the three RAG metrics,
   so no new judge is needed for v1; and (b) **judges are platform infrastructure — `isSystem:true`**
   (all of `016`/`018` are), _not_ the `isSystem:false` app-agent scaffold. `#303`'s real purpose is a
   _leaf app's own user-facing agents_ (editable, exportable); seeding a judge `isSystem:false` would
   miscount the first-run setup gate (`setup-state.ts` counts `isSystem:false` agents) and pull the
   judge into user backup exports (`exporter.ts` exports only `isSystem:false`). A framework-**specific**
   rubric judge (e.g. a facilitation-quality metric) is a future follow-up — and it too would be an
   `isSystem:true` seed following `016`/`018`, not the `#303` scaffold.

2. **Read framework conversation turns from `AiMessage`, reusing the existing pairing pattern.**
   Framework (`facilitation`/`module`) conversations do not emit `AiEvaluationLog` rows (only
   `contextType:'evaluation'` does), so the adapter reads `AiMessage` directly. The exact
   user↔assistant pairing + citation extraction already exists in
   [`evaluations/datasets/capture.ts`](../../lib/orchestration/evaluations/datasets/capture.ts)
   (`captureConversationTurnAsCase`): for an assistant message, find the immediately-preceding `user`
   message (by `createdAt`), take `userQuestion = user.content`, `aiResponse = assistant.content`, and
   **`citations = assistant.provenance.citations`** (the `Citation[]` `scoreResponse` wants, stored on
   the message's `provenance` JSON — no conversion). Extract/reuse a small `pairAssistantTurn(messageId)`
   helper. Filter conversations by `contextType ∈ { 'facilitation', 'module' }` — the two surface
   constants (`FACILITATION_SURFACE_CONTEXT_TYPE`, `MODULE_SURFACE_CONTEXT_TYPE`).

3. **Store results in a NEW `framework_*` table, not `AiEvaluationSession`/`Log`.** The eval-log score
   columns (`faithfulnessScore`/…/`judgeReasoning`) + its `messageId → AiMessage` FK are a perfect
   fit, **but `AiEvaluationLog` is mandatorily bound to a `userId`-owned `AiEvaluationSession`** — a
   manual-eval-session wrapper that doesn't fit a _surface/context-keyed framework batch_ (whose
   "owner" is a contextType/contextId, not a user). So ship a small framework-owned
   `FrameworkConversationEval` table keyed on the natural framework identifiers
   (`conversationId`, `messageId`, `contextType`, `contextId`) + the three score floats +
   `judgeReasoning Json` + `costUsd` + `scoredAt`, with room for the optional supervisor verdict
   (`supervisorReport Json?`, t-2). `messageId` is a **plain scalar hand-FK to core `ai_message`,
   `ON DELETE CASCADE`** (no Prisma `@relation`, X6) — so an eval row is erased with its message (which
   cascades from the user), keeping it GDPR-clean with no separate erasure hook. Migration is
   `--create-only`, `framework_*`-scoped (B13).

4. **The post-hoc supervisor (t-2) is optional and workflow-shaped — reuse the core + copy the
   review-route shim.** `runSupervisorAssessment`
   ([`supervisor/index.ts`](../../lib/orchestration/supervisor/index.ts)) is standalone (caller
   supplies an `llmCall` shim + `stepOutputs`) but its input model is **workflow-execution-shaped**
   (`stepOutputs`/`workflowId`/`executionId`, and the citation validator keys `evidenceStepId` on
   `stepOutputs`). So t-2 builds a **conversation→`stepOutputs` adapter** (one entry per turn, keyed
   so the judge can cite a turn), a framework-conversation **rubric** (replacing the workflow-centric
   default `assessmentCriteria`), and copies the **engine-free `llmCall` shim** from
   [`executions/[id]/review/route.ts`](../../app/api/v1/admin/orchestration/executions/[id]/review/route.ts)
   verbatim (`getModel` → `getProvider` → `provider.chat`, cost via `calculateCost`/`logCost`). Lower
   priority than the metric-scoring core.

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Files (indicative)                                                                                                                                                                                                       | Deps | Status  | PR  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------- | --- |
| t-1 | **Metric-scoring adapter + store + admin API (anchor).** The `FrameworkConversationEval` model + hand-authored migration; the turn reader (pair user→assistant from `AiMessage`, citations from `provenance`, filter `contextType ∈ {facilitation, module}`) reusing the `capture.ts` pattern; score each turn via `scoreResponse` (existing core judges) and persist; `withAdminAuth` **trigger** (score a conversation on-demand) + **read** endpoints. | `prisma/schema/framework-facilitation.prisma`, `prisma/migrations/…`, `lib/framework/facilitation/evaluation/{turns,score-conversation,queries}.ts`, `app/api/v1/admin/framework/facilitation/evaluations/**`, `tests/…` | —    | backlog | —   |
| t-2 | **Post-hoc supervisor over a framework conversation (optional half).** The conversation→`stepOutputs` adapter + a framework rubric + the engine-free `llmCall` shim (copied from the review route) → `runSupervisorAssessment`; store the verdict on the eval row (`supervisorReport`). Trigger endpoint.                                                                                                                                                 | `lib/framework/facilitation/evaluation/supervise.ts`, `app/api/v1/admin/framework/facilitation/evaluations/**`, `tests/…`                                                                                                | t-1  | backlog | —   |

**Sizing (B1): 2 PRs.** The board's ~2 holds — but re-cut by the recon: the planned "judge seeds"
task is **dropped** (decision 1 — existing judges suffice; judges are `isSystem:true`, not the `#303`
scaffold), and the metric-scoring adapter + its store + API is the anchor (t-1). The supervisor (t-2)
is the optional post-hoc half; it depends on t-1's store for the verdict column.

## Open questions — genuinely the owner's (flagged, not parked)

- **Trigger: on-demand vs scheduled.** t-1 ships an **on-demand** admin trigger (score conversation
  N now). A scheduled sweep over recent framework conversations can reuse `AiWorkflowSchedule` — a
  clean later add. _Default: on-demand v1; scheduling deferred._
- **Is the supervisor (t-2) in v1?** It's the heavier, optional half (workflow-shaped adapter +
  rubric). _Default: promote it as t-2 — the shim template makes it tractable — but it can be
  deferred to ship the metric-scoring core alone if you'd rather._
- **Cost attribution.** `scoreResponse` attributes judge-call cost to a `userId`; for an
  admin-triggered framework eval that's the admin (or a service account). _Default: the triggering
  admin's id._

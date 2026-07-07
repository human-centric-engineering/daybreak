---
name: f-eval
feature: 20 · f-eval
epic: Framework v1
status: available to claim ▲ (deps f-facilitation-agents + f-guidance shipped ✅)
owner: _unclaimed_
depends_on: f-facilitation-agents (shipped — the `facilitation`/`module` framework conversations this scores) · f-guidance (shipped — the module surface) · reuses Sunrise-core evals (`scoreResponse`, `runSupervisorAssessment`, the grader registry, the judge-agent seeds)
spec: framework-architecture.md §5.5 (governance — post-hoc supervision + evaluation over framework conversations) · Appendix A — F14 (governance = existing guards + supervisor/evals + audit/approvals)
parent: plan.md
opened: 2026-07-07
---

# f-eval — evaluation wiring over framework conversations

> Feature-level build plan for **`f-eval`** (20). Parent: [[plan#20 · `f-eval`|plan.md]].
> **Split out of [[f-emergence]] (18)** at that feature's close-out (2026-07-07): it is governance
> _observability_ (scoring/supervising framework conversations), separable from the emergence
> _gate_ f-emergence shipped, and the heaviest, most-gap-laden thread — so it earns its own claim +
> plan. The reconnaissance below was done under f-emergence and carried here intact. **Available to
> claim.** Sizing: **task = one PR** (~200–600 lines), ~2 PRs.

## Intent

Governance's post-hoc face (spec §5.5, F14 — _reuse over reinvention_): run the existing
named-metric scoring (faithfulness / groundedness / relevance) and, optionally, the post-hoc
**supervisor** over the framework's own conversations (facilitation + module surfaces), feeding the
improvement loop. Plus the **first framework agent seeds** — the judge agents — via a reusable
`isSystem:false` seed scaffold (#303). The scoring/supervision _machinery_ is all Sunrise-core; this
feature is the **conversation-native adapter** + the **framework judge seeds** that light it up for
facilitation/module conversations.

## Reconciliation with repo reality — carried from the f-emergence recon (2026-07-07)

**Eval wiring reads `AiMessage`, not the eval-log side-channel; and builds the judge-seed scaffold.**
`scoreResponse()` (per Q/A turn) and `runSupervisorAssessment()` are standalone but **not
conversation-native**, and framework (`facilitation`/`module`) conversations do **not** emit
`AiEvaluationLog` rows (only `contextType:'evaluation'` does). So the eval adapter reads turns from
`AiMessage` (citations from the message envelope) for conversations filtered by `contextType ∈
{facilitation, module}` (the two framework surface constants), scores per turn, and aggregates. The
**`#303 isSystem:false` seed scaffold does not exist yet** — the existing judge seeds (`016`/`018`)
are `isSystem:true`; these would be the **first framework agent seeds**, so this feature builds the
scaffold helper (a `seedFrameworkAgent`-style upsert with `isSystem:false`, in a seed subdirectory
per the `runner.ts` convention) — the reusable mechanism f-facilitation-agents deliberately didn't
need (it shipped seed-free).

Standing disciplines apply at build (confirm, don't assume): **ship nothing a fork has to delete**,
**follow the shipped code**, and **confirm "pure framework-tier" at build** ([[planning-retro#B17|B17]])
— the eval scorers/supervisor are core, consumed through their public API; a missing seam would be a
fork-carried core seam ([[planning-retro#B19|B19]], ledgered).

## Indicative tasks (to be promoted on claim)

- **t** — **Evaluation wiring — metric scoring (+ post-hoc supervisor) over framework conversations.**
  A conversation-native adapter: read `AiMessage` turns for `contextType ∈ {facilitation, module}`
  conversations, run `scoreResponse` per turn (faithfulness/groundedness/relevance) + aggregate; an
  optional conversation-shaped `runSupervisorAssessment`; store results. A filter helper for the
  framework-contextType set. Files: `lib/framework/facilitation/evaluation/{score-conversation,supervise}.ts`,
  `app/api/v1/admin/framework/facilitation/evaluations/**`, `tests/…`.
- **t** — **Judge seeds via a new `isSystem:false` framework agent-seed scaffold (#303).** Build the
  scaffold helper (the first framework agent seeds — a `seedFrameworkAgent` upsert with
  `isSystem:false` in a seed subdirectory per `runner.ts`); seed the eval judges (resolved by slug);
  handle the seed-at-deploy vs `syncFramework`-at-boot lifecycles. Files:
  `lib/framework/seeds/seed-framework-agent.ts`, `prisma/seeds/framework-eval/…`, `tests/…`.

## Open questions — for the claimant

- **Store shape.** Where do per-conversation eval results live — a new `framework_*` table, or the
  existing `AiEvaluationLog`/session models re-pointed at framework conversations? (The recon noted
  framework convos emit no `AiEvaluationLog` today; decide whether to add log-writing for the
  framework contextTypes or store results in a framework-owned table.)
- **Trigger.** On-demand (admin runs an eval over a conversation) vs scheduled (a workflow sweeps
  recent framework conversations). On-demand is the smaller v1; scheduling can reuse `AiWorkflowSchedule`.
- **Which judges.** The RAG-quality trio (faithfulness/groundedness/relevance) vs adding
  coherence/brand-voice; and whether the supervisor is in-scope for v1 or a follow-up.

---
name: f-emergence
feature: 18 · f-emergence
epic: Framework v1
status: in flight (deps f-engine + f-facilitation-agents shipped ✅) — claim + build-ready plan
owner: John
depends_on: f-engine (shipped — `validateGraphInvariants`, the invariant-check stage the pipeline reuses) · f-facilitation-agents (shipped — the facilitation surface + roles escalation keys on) · f-map (shipped — `publishDraft` / `FacilitationGraphVersion`, the map publish target) · f-policies (shipped — the `FacilitationPolicy` table the `escalation` + `auto_approval` kinds live in; **F15 escalation was deferred from f-policies and is picked up here as t-1**)
spec: framework-architecture.md §5.5 (emergence — the proposal pipeline; escalation pathways) · Appendix A — F17 (structure-change proposal pipeline) · F15 (escalation pathways) · §9.2 (auto-approval risk taxonomy — deferred, ship `autoApprove: none`)
parent: plan.md
opened: 2026-07-07
planned: 2026-07-07
---

# f-emergence — structure-change proposal pipeline + escalation + evaluation wiring

> Feature-level build plan for **`f-emergence`** (18). Parent:
> [[plan#18 · `f-emergence` — proposal pipeline + evaluation wiring|plan.md]]. Binding _how_:
> [[framework-architecture#5.5|spec §5.5]] (Emergence, safely) + Appendix A F17 / F15 / §9.2.
> **Build-ready** — reconciliations settled against repo reality (three reconnaissance sweeps of
> the version-publish / approval / eval / escalation machinery, 2026-07-07). Sizing: **task = one
> PR** (~200–600 lines). This is a **large feature** (~5 PRs) spanning three fairly independent
> concerns — read the sizing note.

## Intent

Two threads converge here. **(1) Emergence (F17)** — the framework's self-configuration gate: a
proposing agent (or an admin tool, eventually an expert-onboarding agent) writes a
`StructureChangeProposal` — a diff against the current published map — and it flows **one** pipeline
regardless of author: _schema validation → engine invariant check → risk classification → approval
→ publish as a new version_, with `createdBy = "agent:<slug>"` preserved in version history. The
deterministic spine is **never written raw**; emergence is real but always laundered through
validation and versioning. Ships `autoApprove: none` (every proposal needs human sign-off).
**(2) The picked-up escalation kind (F15)** — the governance escalation pathway f-policies deferred:
_when signal S is detected in scope X, do Y_. It's picked up **first** (t-1) so the deferred item
lands straight away, and it's a natural fit here — f-emergence works in the same approval/notify
machinery. **(3) Evaluation wiring** — post-hoc supervisor + named-metric scoring over framework
conversations, feeding the improvement loop; the heaviest, most-gap-laden thread.

## What ships here, and what deliberately does not

**In scope.**

- **Escalation-pathway kind (F15)** — a 4th `FacilitationPolicy` kind + a **second fork-carried core
  seam** (a post-detection guard-event contributor) that turns a guard flag in a facilitation scope
  into a configured pathway (route / notify / log) over the shipped response machinery. _(Delivers
  f-policies' deferred t-4.)_
- **`StructureChangeProposal` + the map-subject pipeline (F17)** — the proposal model, the pipeline
  runner (validate → invariant-check → risk-class → approve → publish), its **own** approval state,
  and the `withAdminAuth` proposal admin API. Ships `autoApprove: none`.
- **Evaluation wiring** — a conversation-native adapter running named-metric scoring (+ optional
  post-hoc supervisor) over framework (`facilitation`/`module`) conversations, and the **first
  framework agent seeds** (judge agents) via a new `isSystem:false` seed scaffold.

**Out of scope** (deferred / owned elsewhere):

- **Module-config + policy proposal subjects** — v1 proposals target the **map** only (see decision 1).
  A `subjectType` discriminator leaves the seam; module-config/policy subjects are an additive later
  scope.
- **The auto-approval risk _taxonomy_** (which change classes are `low_risk`) — deferred per §9.2
  (empirical; needs a population of real proposals). Ship the reader at `none`.
- **The proposal-authoring agent / capability** (an agent that _writes_ proposals) — this feature
  ships the pipeline + admin approval; a capability for an agent to submit a proposal is a thin
  follow-up once the pipeline exists.
- **The proposal/eval admin _UI_** → **`f-ops-views` (15)** (API-first, the standing split).

## Reconciliation with repo reality — the design decisions (settled 2026-07-07)

Organising principle, carried throughout: **ship nothing a fork has to delete**, **follow the
shipped code, not the rev-16 spec sketch**, **confirm "pure framework-tier" at build**
([[planning-retro#B17|B17]]), and reuse over reinvention (F14/F17).

1. **v1 proposals target the MAP subject only.** The spec sketch says a proposal diffs "map, module
   config, or policy set," but the three subjects are **heterogeneous**: the **map** has
   draft/publish/rollback versioning (`publishDraft` → immutable `FacilitationGraphVersion`) _and_ a
   standalone engine invariant check (`validateGraphInvariants`, F17's own stage); **module-config**
   is a different point-in-time snapshot shape (`saveModuleConfig` overwrites `Module.config` +
   snapshots a `ModuleVersion`) with **no** engine-invariant analog; **policy** is plain CRUD with
   **no version target at all**. The spec's driving concern is that _the deterministic spine — the
   map — is never written raw_. So v1 builds the pipeline for the **map** (the one subject with full
   versioning + invariant checks) and carries a `subjectType` discriminator so module-config/policy
   subjects are an additive change, never a rewrite. Building three heterogeneous pipelines at once
   would be the padded version (B1).

2. **f-emergence owns its proposal approval state — the workflow approval queue is not reusable.**
   The existing approval queue is structurally an `AiWorkflowExecution` in status
   `paused_for_approval` with an `awaiting_approval` entry in its `executionTrace` — every action
   (`executeApproval`/`executeRejection`, the lease, `currentStep` resume, the running-step sweep)
   assumes a workflow-execution row. There is **no** execution-agnostic approvable entity. So a
   `StructureChangeProposal` carries its **own** status (one of `pending`, `approved`, `rejected`,
   `published`) plus `approve`/`reject` service actions that mirror `approval-actions.ts` (its
   optimistic-lock and audit shape) minus the workflow machinery. Modelling a proposal as a
   synthetic workflow execution parked on a `human_approval` step was considered and rejected — it
   drags in the whole engine for a row that just needs an approve/reject gate.

3. **`createdBy = "agent:<slug>"` needs no schema change.** All three `createdBy` columns
   (`FacilitationGraphVersion`, `ModuleVersion`, `FacilitationPolicy`) are plain `String?` scalars
   with **no** `User` relation (the X6 boundary choice) — `FacilitationGraphVersion.createdBy`'s
   doc-comment already names `"agent:<slug>"` (F17) explicitly. So a proposal's approved publish
   writes the agent slug straight into the existing `createdBy` arg. Ship a tiny
   `formatAgentAuthor(slug)` / `parseAuthor(createdBy)` helper for the `"agent:"` convention (the arg
   is named `userId` today — a documented semantic overload the `string` type permits). Audit
   (`logAdminAction`) records the agent author too.

4. **Escalation (F15) needs a SECOND fork-carried core seam — a POST-detection guard-event
   contributor.** The t-3 guard-floor seam runs _before_ detection and returns a _mode_; it cannot
   observe a guard _firing_. The three guard sites in core `streaming-handler.ts` emit **no** event
   on a flag/block — a flag escapes into no bus. So F15 needs a new outbound touch-point:
   `registerGuardEventContributor` + an `emitGuardEvent(ctx, { guard, outcome })` call at each of the
   three guard sites (post-`scanForInjection`/`scanOutput`/`scanCitations`). Home it in the existing
   [`chat/guard-floor.ts`](../../lib/orchestration/chat/guard-floor.ts) (sibling to
   `resolveGuardFloors` — same registry/idempotency/throw-isolation conventions, same
   `GuardFloorContext { contextType, contextId, agentId }`). Generic + vocab-free (boundary CI green),
   empty-registry = inert, ledgered [[upstream-asks]]. `emitHookEvent` is **not** an option — it is
   outbound-webhook-only and cannot reach the internal `notifyEscalation`/`drainEngine` machinery
   (the f-module-bindings finding). The framework contributor matches an `escalation` policy for the
   turn's `(role, guard, outcome)` and composes the shipped response bridges: `notifyEscalation`
   (email/webhook via `AiOrchestrationSettings.escalationConfig`), a `drainEngine`-dispatched workflow
   ("route to a differently-configured agent"), and **always logs** (audit + a `JourneyEvent` since
   the signal is user-scoped).

5. **Escalation kind mirrors `guard_minimum`.** A 4th member of the `facilitationPolicySchema`
   discriminated union (payload `{ scope: { type: 'facilitation_role', id }, signal: { guard:
input|output|citation, outcome: flagged|blocked }, response: { routeToWorkflowSlug?, notify?,
resources? } }`), added to `FACILITATION_POLICY_KINDS` + the migration `kind` CHECK, guarded by the
   `kinds.test.ts` drift check. It lives in f-policies' `kinds.ts` — **this feature delivers
   f-policies' deferred t-4**; on merge, f-policies.md's t-4 row flips to done with this PR#.

6. **Eval wiring reads `AiMessage`, not the eval-log side-channel; and builds the judge-seed
   scaffold.** `scoreResponse()` (per Q/A turn) and `runSupervisorAssessment()` are standalone but
   **not conversation-native**, and framework (`facilitation`/`module`) conversations do **not** emit
   `AiEvaluationLog` rows (only `contextType:'evaluation'` does). So the eval adapter reads turns from
   `AiMessage` (citations from the message envelope) for conversations filtered by `contextType ∈
{facilitation, module}`, scores per turn, and aggregates. The **`#303 isSystem:false` seed
   scaffold does not exist** — existing judge seeds (016/018) are `isSystem:true`; f-emergence's judge
   seeds would be the **first framework agent seeds**, so this feature builds the scaffold helper
   (a `seedFrameworkAgent`-style upsert with `isSystem:false`, in a seed subdirectory per the
   `runner.ts` convention) — the reusable mechanism f-facilitation-agents deliberately didn't need.

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Files (indicative)                                                                                                                                                                                                                                             | Deps | Status  | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------- | --- |
| t-1 | **Escalation-pathway kind (F15) + the guard-event core seam.** _Picks up f-policies' deferred t-4, first._ The 2nd fork-carried core seam (`registerGuardEventContributor` + `emitGuardEvent` at the 3 guard sites, post-detection, generic, empty-registry inert) + the `escalation` policy kind (union member + CHECK migration) + the framework contributor composing `notifyEscalation` + `drainEngine` + audit/`JourneyEvent`. Ledger [[upstream-asks]].                          | `lib/orchestration/chat/guard-floor.ts` (+ the event seam), `lib/orchestration/chat/streaming-handler.ts` (3 emit sites), `lib/framework/facilitation/policies/{kinds,escalation}.ts`, `prisma/migrations/…`, `.context/framework/upstream-asks.md`, `tests/…` | —    | backlog | —   |
| t-2 | **`StructureChangeProposal` model + the map-subject pipeline + own approval state.** The proposal table (`subjectType` discriminator, `subjectId`, `proposedDefinition` Json, `status`, `createdBy="agent:<slug>"`, hand-FK); the pipeline runner (Zod schema validation → `validateGraphInvariants` → risk-class → own approval state); the `formatAgentAuthor`/`parseAuthor` helper. Ships **map-only**; publishes an approved proposal via `publishDraft` writing the agent author. | `prisma/schema/framework-facilitation.prisma`, `prisma/migrations/…`, `lib/framework/facilitation/emergence/{proposal-service,pipeline,author}.ts`, `tests/…`                                                                                                  | —    | backlog | —   |
| t-3 | **Proposal admin API + approve/reject + the `autoApprove` reader.** `withAdminAuth` list/get/approve/reject over `StructureChangeProposal` (mirroring `approval-actions.ts`, minus the workflow machinery); on approve → run publish; audit. The `auto_approval` policy reader (resolves to `none` → human approval required; multi-row conflict resolved; the `low_risk` taxonomy documented-deferred, §9.2).                                                                         | `app/api/v1/admin/framework/facilitation/proposals/**`, `lib/framework/facilitation/emergence/{approval,auto-approve}.ts`, `tests/…`                                                                                                                           | t-2  | backlog | —   |
| t-4 | **Evaluation wiring — metric scoring (+ post-hoc supervisor) over framework conversations.** A conversation-native adapter: read `AiMessage` turns for `contextType ∈ {facilitation, module}` conversations, run `scoreResponse` per turn (faithfulness/groundedness/relevance) + aggregate; optional conversation-shaped `runSupervisorAssessment`; store results. Filter helper for the framework-contextType set.                                                                   | `lib/framework/facilitation/evaluation/{score-conversation,supervise}.ts`, `app/api/v1/admin/framework/facilitation/evaluations/**`, `tests/…`                                                                                                                 | —    | backlog | —   |
| t-5 | **Judge seeds via a new `isSystem:false` framework agent-seed scaffold (#303).** Build the scaffold helper (the first framework agent seeds — a `seedFrameworkAgent` upsert with `isSystem:false` in a seed subdirectory per `runner.ts`); seed the emergence/eval judges (resolved by slug). Handle the seed-at-deploy vs `syncFramework`-at-boot lifecycles.                                                                                                                         | `prisma/seeds/framework-emergence/…`, `lib/framework/seeds/seed-framework-agent.ts`, `tests/…`                                                                                                                                                                 | t-4  | backlog | —   |

**Sizing (B1): ~5 PRs — a large feature, honestly.** The board's "~4" undercounts: reconnaissance
revealed real depth in all three threads (a proposal pipeline whose approval queue isn't reusable, an
escalation kind needing a second core seam, an eval thread with no conversation-native path + a
non-existent seed scaffold). The tasks split along **independent concerns**, not padding: **t-1**
(escalation) is self-contained and sequenced **first** per the owner's ask; **t-2 + t-3** are the
emergence proposal core (model+pipeline, then admin approval); **t-4 + t-5** are the eval thread
(scoring adapter, then judge seeds). t-1, t-2, and t-4 are mutually independent (parallelisable);
t-3 depends on t-2, t-5 on t-4.

## Open questions — genuinely the owner's (flagged, not parked)

Everything tractable is resolved above. Two are product-scope forks (defaults recorded); one is a
sequencing/scope call:

- **Eval-wiring scope (sequencing).** The eval thread (t-4/t-5) is the heaviest and least on the F17
  critical path — it's governance _observability_, separable from the emergence _gate_. **Default:
  keep it in f-emergence but sequence it last** (after escalation + the proposal core land), so the
  feature delivers the deferred F15 + the F17 pipeline first. _Alternative:_ split t-4/t-5 into a
  small standalone feature (`f-eval-wiring`) if you'd rather ship the emergence gate on its own.
- **Proposal author-of-record for the admin approver.** When a human approves an agent-authored
  proposal, the _published version's_ `createdBy` is the proposing `agent:<slug>` (authorship
  preserved, F17) — but the **approval action** is audited to the admin. _Default: version author =
  agent; approval audit = admin._ Confirm this is the intended provenance split.
- **Escalation response palette.** t-1 ships `{ routeToWorkflowSlug?, notify?, resources? }`. Whether
  day-one needs conversation-rerouting (`routeToWorkflowSlug` via `drainEngine`) or just notify+log
  is a product call. _Default: ship all three; notify+log are the safety-critical minimum._

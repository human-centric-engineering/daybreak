---
name: f-governance-plus
feature: 23 · f-governance-plus
epic: Framework v1.1
status: in flight
owner: John
depends_on: f-emergence (shipped — #78 · #80 · #82) · f-eval (shipped — #88 · #90) · f-overlays (shipped — #93 · #95 · #96 · #98) · reuses f-module-config (#56 / #58) · f-policies (#73–#78) · f-map version-service
spec: framework-architecture.md §5.5 (governance / emergence) · §5.4 (eval / supervisor) · §5.6 · F9 / F13 (overlays) · Appendix A — F17 (proposal pipeline)
parent: plan.md
opened: 2026-07-09
---

# f-governance-plus — additive backend enhancements

> Feature-level build plan for **`f-governance-plus`** (#23), the v1.1 follow-on that ships the
> "additive when wanted, deferred by default" enhancements scattered across the shipped
> governance / eval / overlays features. Parent:
> [[plan#23 · `f-governance-plus` — additive backend enhancements|plan.md feature 23]].
> Binding _how_: [[framework-architecture#5. Facilitation Structures|§5.4/§5.5/§5.6]] · Appendix A (F9, F13, F17).
> Sizing follows the parent plan: **task = one PR** (~200–600 lines, cohesive, reviewable).

## Intent

Three shipped governance/observability features each drew a **deliberate v1 boundary** and named the
work past it as "additive later" in their own docs — the classic graveyard ([[planning-retro#B28|B28]]),
here on the _backend_ rather than the admin UI ([[f-admin-surfaces]] was the UI graveyard). Unlike 21/22
this is **pure backend, no UI surface** and **nothing depends on it** — it's the lowest-priority v1.1
feature, picked up here because it's the **quickest and lowest-risk** of the two remaining follow-ons:
every piece reuses a primitive that already ships, with no canvas/visualisation work and no open
product-semantics question (contrast 21's `module.completed` semantics + shipped-canvas host refactor).

- **`f-emergence` (18)** shipped the `StructureChangeProposal` pipeline for the **`'map'` subject only**,
  with the `subjectType` seam explicitly stubbed (a defensive `throw` at `pipeline.ts:43`) for
  `module_config` / `policy` later — and left proposals **human/API-authored only** (no agent can _write_ one).
- **`f-eval` (20)** shipped **on-demand, single-conversation** framework evaluation (metric scorer +
  post-hoc supervisor), deferring a **scheduled sweep** over recent conversations and a
  **framework-specific rubric judge** ([[f-eval]] decision 1 / open-questions).
- **`f-overlays` (19)** shipped node embeddings re-embedded **on-demand** and a proactive nudge delivered
  **by email only**, naming **auto-embed-on-publish** and an **outbound-webhook nudge channel** as the two
  follow-ups ([[f-overlays]] open-questions; `embed-sync.ts:8-11`, `nudge.ts:5-8`).

## Reconciliation with current repo reality (verified 2026-07-09)

Reconciled against the tree, not the board sketch ([[planning-retro#B2]]) — three parallel recon passes.
Every reuse target below was confirmed to exist; the feature is **wiring + additive extension**, not new
machinery. The one surprise vs the board sketch: the "scheduled eval sweep" is **not** a bare
`AiWorkflowSchedule` row — the fork-lawful scheduler seam is a **custom workflow step type** (see decision B).

### 1. Emergence — `subjectType` seam + no authoring capability

- **Submit** — `submitStructureChangeProposal({subjectType, subjectId, proposedDefinition, createdBy, actorUserId?, clientIp?})` (`lib/framework/facilitation/emergence/proposal-service.ts:41`) → `validateProposal` → `create({status:'pending'})` → audit. Sole caller today: the admin `POST …/facilitation/proposals` route.
- **Per-subject seam** — `validateProposal(subjectType, …)` (`pipeline.ts:38`) branches on subject; `pipeline.ts:43` `throw`s for anything but `'map'` (unreachable today — the Zod schema pins `z.literal('map')`, `api-schemas.ts:16`). Approve applies via `publishDefinition` (`approval.ts:85`, the map spine writer, with a `baseVersion` conflict check).
- **Constraint points pinned to `'map'`** (the extension checklist): DB CHECK (`…20260707150000…/migration.sql:37-39`, a **new migration** to widen), Zod literal→enum (`api-schemas.ts:16`), TS union (`pipeline.ts:22`), pipeline validation branch (`pipeline.ts:43`), approval apply branch (`approval.ts:85`). `publishedVersionId` (`schema:215`) is a **plain nullable String, not a `@relation`** — it holds a `ModuleVersion.id` / `FacilitationPolicy.id` **with no schema change**.
- **Reusable apply-fns** — module_config: `saveModuleConfig({slug,config,userId,changeSummary,clientIp})` (`modules/config/version-service.ts:126`, validates + snapshots + audits); policy: `createFacilitationPolicy(…)` / `updateFacilitationPolicy(…)` (`policies/policy-service.ts:49/87`, validate via `assertValidFacilitationPolicy`). Both take a real `userId` — pass `reviewedBy` (approving admin), exactly as the map path passes it to `publishDefinition`.
- **Capability seam** — `BaseCapability` (`lib/orchestration/capabilities/base-capability.ts:53`); framework built-ins register in-code via `registerFrameworkCapability` in `initFramework()` (`lib/framework/index.ts:78-80`), synced to an `ai_capability` row (`category:'framework'`, bare-slug namespaced). Closest template: `RequestTransitionCapability` (`lib/framework/guidance/capabilities/request-transition.ts`) — the existing facilitation-write tool. Facilitation seats (`FACILITATION_ROLES`, `roles.ts:17`) are a **documented reference, not a gate** — granting is the ordinary `AiAgentCapability`.

### 2. Eval — on-demand only, no sweep, no framework rubric judge

- **On-demand entrypoints** (both single-conversation, admin-triggered, loop over `listScorableTurns`): `scoreConversation({conversationId, actorUserId, clientIp})` (`evaluation/score-conversation.ts:61`, 3-judge metric scorer, upsert per `messageId`) and `superviseConversation({conversationId, …})` (`evaluation/supervise.ts:89`, one supervisor verdict). Both **idempotent-upsert by `messageId`**.
- **No "recent framework conversations" query exists** — a sweep must add one over `AiConversation where contextType IN ('facilitation','module') AND <has an un-scored scorable turn>`.
- **Scheduling** — core cron (`runMaintenanceTick` → `processDueSchedules`, `scheduling/scheduler.ts:202`) is **Sunrise-owned + hard-coded** (no framework periodic-task hook). f-overlays already solved this the fork-lawful way: a **custom workflow step type** `framework_proactive_guidance` (`overlays/proactive-step.ts:24`, `registerStepType` from `initFramework()`), which an operator points an `AiWorkflowSchedule` cron at. The scheduler gives per-execution `budgetLimitUsd` capping + claim-locking for free.
- **Judges** are `AiAgent kind='judge'` rows, **seeded, no code** (`prisma/seeds/016-evaluation-judges.ts`); invoked via `driveJudgeAgent({agentSlug, question, answer, …})` (`lib/orchestration/evaluations/judge-driver.ts:88`, never throws). `eval-judge-brand-voice` (`016-…:277`) is the precedent bespoke-rubric judge. `FrameworkConversationEval` carries fixed `faithfulness/groundedness/relevance` + `judgeReasoning` Json + `supervisorReport` Json.

### 3. Overlays — on-demand embed, email-only nudge

- **Embed** — `syncMapNodeEmbeddings({slug, actorUserId, clientIp?})` (`overlays/embed-sync.ts:47`); self-resolves the **published** version via `getPublishedMap` (embeds are keyed on `(graphSlug, nodeKey, version)`, so it **must run after the publish tx commits**), core `embedBatch`, idempotent upsert. Triggered today only by `POST …/maps/[slug]/embeddings` (`route.ts:43`). `actorUserId` is currently a required `string`.
- **Publish paths** (the only writers of `FacilitationGraph.publishedVersionId`, all in `map/version-service.ts`): `publishDraft:279`, `publishDefinition:357` (`actorUserId` may be **`null`**), `rollback:430` (also restales embeddings), `createGraph:157` (v1 branch). **No publish event/hook seam** — auto-embed is a direct post-commit call.
- **Nudge** — `deliverProactiveNudges` (`overlays/nudge.ts:70`) sends generic `sendEmail(ProactiveNudgeEmail)` to the journey owner, throttled 7d via `framework_journey_nudge` (send-then-record). The per-user candidate (`NudgeCandidate`, `proactive-sweep.ts:41`) carries `{nodeKey, reason, graphSlug}` the **email discards** but a webhook could carry.
- **Outbound webhook precedent** — `escalation-notifier.ts:69` is the exact "email OR config `webhookUrl`, plain `fetch` POST with `AbortSignal.timeout(10s)`, never throws" pattern to mirror. The heavier `emitHookEvent` / webhook-subscription systems are **global admin fan-out, not per-owner routing** — wrong shape for a per-journey-owner nudge.

## The shape decisions (read this first)

Settled; reasoning recorded so a reviewer or resumed session doesn't relitigate.

### A. Four tasks, not the board's three — the emergence area splits on the migration/capability seam

The board sketched three tasks; at recon the emergence item splits cleanly ([[planning-retro#B1]] / [[planning-retro#B25]]) into a **backend subject-seam extension (a migration + governance-critical pipeline/approval branches)** and a **separate agent-facing capability** — different machinery, different review surface. So four promoted PRs (t-1…t-4), **mutually independent** except t-2's _full_ value depends on t-1 (it authors `'map'` proposals without it). No shared schema; any order / parallel after the claim PR.

### B. The eval sweep is a custom workflow STEP TYPE, not an `AiWorkflowSchedule` row (fork law)

The board said "reuse `AiWorkflowSchedule`". Recon corrects this: a schedule points at a _published workflow_, and there is **no eval workflow step to run**. The maintenance tick is Sunrise-core (un-editable in the fork). So the fork-lawful seam — already established by f-overlays' proactive sweep — is a **`framework_eval_sweep` custom step type** registered from `initFramework()`; the operator authors a one-step workflow of that type and cron-schedules it. Daybreak ships the step type and **seeds no schedule row** (nothing a fork must delete — [[building-a-feature]] "ship nothing a fork deletes").

### C. Auto-embed is a fire-and-forget post-commit call, not a new event bus

No publish-event seam exists and building one (adding `facilitation.map.published` to core `HOOK_EVENT_TYPES`) is a core edit for one internal consumer. Instead a small `autoEmbedAfterPublish(slug, actorUserId)` helper is called **after the publish tx commits** (never inside it — embedding hits the network and must not fail/extend the publish) as `void …catch(log)`, from all four publish paths. Embeddings are advisory (degrade to empty per F9), the on-demand route stays as the manual repair/backfill path, and the natural-key upsert makes re-runs idempotent. `SyncMapNodeEmbeddingsArgs.actorUserId` relaxes to `string | null` (system actor for auto-approved `publishDefinition`).

### D. The webhook nudge channel is env-configured (no settings singleton, no admin UI) in v1

There is no framework nudge-config store today. Rather than add a settings singleton + admin form (a UI surface this backend-only feature deliberately avoids), v1 reads a fork-owned env var (e.g. `FRAMEWORK_NUDGE_WEBHOOK_URL`) and a channel selector; when set, `deliverProactiveNudges` POSTs one payload per nudged owner (`{userId, email, journeys:[{journeyId, graphSlug, nodeKey, reason}], timestamp}`) alongside/instead of the email, reusing the escalation-notifier `fetch` shape. The 7-day throttle table is the channel-independent idempotency mechanism, unchanged. An admin-configurable destination + true per-owner endpoints are deferred (decision recorded; nothing depends on them).

## Which seams this feature builds vs consumes

**Consumes (all shipped, framework-tier unless noted):**

| Reuse target                                                                                                                   | Shipped in                   | Used by   |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------- |
| `submitStructureChangeProposal` · `validateProposal` · `approveProposal`                                                       | f-emergence                  | t-1 / t-2 |
| `saveModuleConfig` · `createFacilitationPolicy` / `updateFacilitationPolicy`                                                   | f-module-config / f-policies | t-1       |
| `BaseCapability` · `registerFrameworkCapability` · `RequestTransitionCapability`                                               | core / f-guidance            | t-2       |
| `scoreConversation` · `superviseConversation` · `registerStepType` · `driveJudgeAgent` · `AiWorkflowSchedule` cron             | f-eval / f-overlays / core   | t-3       |
| `syncMapNodeEmbeddings` · the 4 `version-service` publish fns · `deliverProactiveNudges` · escalation-notifier `fetch` pattern | f-overlays / f-map / core    | t-4       |

**Builds (new, framework-tier):**

- **t-1** — a **new migration** widening the `structure_change_proposal.subjectType` CHECK to `('map','module_config','policy')`; per-subject validation + apply branches.
- **t-3** — a **new migration** adding `FrameworkConversationEval.rubricScore Float?`; a `framework_eval_sweep` step type + a recent-un-scored-conversations query; a seeded `eval-judge-framework-rubric` judge.
- **t-2 / t-4** — no migration (a capability; a helper + an env-gated webhook POST).

## Framework-tier assessment — expected pure, confirm at build (B17)

Every piece is framework-tier: `lib/framework/facilitation/{emergence,evaluation,overlays}/**`, `lib/framework/modules/config/**`, a new capability under a framework `capabilities/` dir, two `framework_*` migrations, a `framework-*` seed for the rubric judge, and the env var is fork-owned. All consumption of core (`driveJudgeAgent`, `sendEmail`, `embedBatch`, `registerStepType`, the scheduler) is in the **allowed direction**. So the expectation is **pure framework-tier, no upstream Sunrise issue** — but per [[planning-retro#B17]] confirm at each task and ledger any core seam that surfaces (the likeliest candidate: if a publish-event hook proves worth generalising, that's an upstream ask, not a fork edit).

## Test strategy (house style)

Vitest on `happy-dom`, **no live DB** ([[planning-retro#B9]]): mock `@/lib/db/client`, forward `executeTransaction` to a `tx` mock; real-DB fidelity via `smoke:*` only. Concretely:

- **t-1** — the extended `validateProposal`/`approveProposal` for each new subject: a `module_config` proposal validates via the reused config-schema path and applies via `saveModuleConfig` (mocked); a `policy` proposal validates via `assertValidFacilitationPolicy` and applies via `createFacilitationPolicy`; the widened CHECK is exercised through the service, and the `baseVersion` conflict re-check (module_config) refuses a stale approve. Migration-hygiene CI green.
- **t-2** — the `submit_proposal` capability: Zod arg validation, `execute` resolves `agentId→slug` → `createdBy = "agent:<slug>"`, calls `submitStructureChangeProposal` with `actorUserId = context.userId`, returns the structured result; `requiresApproval:false` asserted in the synced row shape.
- **t-3** — the sweep step executor over a stateful in-memory fake: selects only un-scored conversations, loops the configured passes, respects `maxConversations`, threads the execution actor; the rubric judge is invoked via `driveJudgeAgent` (mocked) and its score lands in `rubricScore`. The judge itself is a **seed** (tests-only fixture proves the seed row shape, no live judge call).
- **t-4** — `autoEmbedAfterPublish` fires after (not inside) each publish tx and swallows embed failures (publish still succeeds); the nudge webhook POSTs the grouped per-owner payload when the env var is set, is skipped when unset, and never throws (mirrors escalation-notifier's contract test).

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                   | Files (indicative)                                                                                                                                                                                                                                | Deps                             | Status                | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------- | --- |
| t-1 | **Proposal subjects** — widen `subjectType` to `module_config` + `policy` (migration + pipeline/approval branches, reusing `saveModuleConfig` / `updateFacilitationPolicy`)                            | `prisma/migrations/*_framework_widen_scp_subject/`, `lib/framework/facilitation/emergence/{pipeline,approval,api-schemas}.ts`, `tests/…`                                                                                                          | —                                | **done** #131 (+#132) | —   |
| t-2 | **`submit_proposal` authoring capability** — a framework capability that writes a pending proposal, granted to the `facilitator` seat                                                                  | `lib/framework/facilitation/emergence/capabilities/{submit-proposal,index}.ts`, registration in `lib/framework/index.ts`, `tests/…`                                                                                                               | (soft: t-1 for non-map subjects) | **available** ▲       | —   |
| t-3 | **Scheduled eval sweep + rubric judge** — a `framework_eval_sweep` step type looping the shipped scorers over recent un-scored conversations + a seeded framework rubric judge + `rubricScore` storage | `lib/framework/facilitation/evaluation/{sweep-step,recent-conversations}.ts`, `prisma/schema/framework-facilitation.prisma` (+`rubricScore`) + migration, `prisma/seeds/*framework-rubric-judge*`, `lib/framework/index.ts` (register), `tests/…` | —                                | **available** ▲       | —   |
| t-4 | **Auto-embed-on-publish + webhook nudge channel** — fire-and-forget embed after the 4 publish paths + an env-gated outbound-webhook nudge alongside email                                              | `lib/framework/facilitation/map/version-service.ts` (4 call sites), `lib/framework/facilitation/overlays/{embed-sync,nudge}.ts`, `lib/app/env.ts`? (fork env — confirm seam), `tests/…`                                                           | —                                | **available** ▲       | —   |

**Four promoted PRs, mutually independent** (disjoint subsystems, no shared schema — decision A) → any order / parallel after this claim PR. t-2's full value (authoring non-map proposals) lands with t-1 but it ships useful for `'map'` alone, so it is **not** hard-blocked. t-1 and t-3 each carry one `framework_*` migration; t-2 and t-4 carry none.

### t-1 · Proposal subjects — `module_config` + `policy`

- **Migration** — a new hand-written `framework_*` migration DROPs and re-ADDs the `structure_change_proposal.subjectType` CHECK as `IN ('map','module_config','policy')` (the Prisma field is already a bare `String`; no `schema.prisma` change). Apply via `migrate dev`; keep the pgvector/tsvector DROP-strip discipline ([[planning-retro#B13]]) if the diff touches indexed tables.
- **Pipeline** — `ProposalSubjectType` union + Zod enum widened; `validateProposal` gains a per-subject branch: `module_config` reuses the config-schema validation (the walker behind `saveModuleConfig`) and captures the module's current version as `baseVersion`; `policy` validates `(kind, payload)` via `assertValidFacilitationPolicy` (`baseVersion: null` — last-writer-wins, decision resolved below).
- **Approval** — `approveProposal` switches on `subjectType` to pick the apply-call (`saveModuleConfig` / `createFacilitationPolicy`, passing `reviewedBy` as `userId`), guarding the map-only `getGraphDetail` conflict check behind the map branch; module_config re-checks its captured `baseVersion` before applying; `publishedVersionId` stores the resulting `ModuleVersion.id` / policy id (plain String, no schema change).
- **Done when:** an operator (or an authoring agent, once t-2 lands) can submit + approve a `module_config` or `policy` proposal that applies through the shipped config/policy services with authorship preserved and a stale-base module_config approve refused; contract tests green; migration-hygiene + boundary CI green; **gates green — `/pre-pr` → `/security-review` → `/code-review`** before the PR ([[planning-retro#B4]]).
- **Shipped as #131 (+ #132 review-fix).** Two `/code-review`-driven corrections to the plan-time apply shapes: **(a)** the `policy` subject applies via **`updateFacilitationPolicy` overwriting an existing policy in place** (`subjectId` = the policy **id**, not the kind), _not_ `createFacilitationPolicy` — the plan's create-based "last-writer-wins" would have inserted a duplicate enabled row that the _old_ policy still overrode at enforcement (guard-floor max-rank / gating deny-on-any / auto-approval none-wins), so the change never took effect. All three subjects now change an **existing** target, never create one. **(b)** `module_config` gained an in-transaction `expectedBaseVersion` guard on `saveModuleConfig` (mirrors the map path), closing a TOCTOU the pre-claim check alone left open. See [[planning-retro#B30]].

### t-2 · `submit_proposal` authoring capability

- A single polymorphic capability (decision resolved below): args `{subjectType (enum), subjectId, proposedDefinition: z.unknown()}`, all shape-validation delegated to `validateProposal`. `execute` resolves the agent slug from `context.agentId`, sets `createdBy = formatAgentAuthor(slug)` and `actorUserId = context.userId`, calls `submitStructureChangeProposal`, returns `{proposalId, status}`. `requiresApproval:false` (the downstream human approve/publish is the real gate), `isIdempotent:false`. Registered from `initFramework()`; granted to the `facilitator` seat via the ordinary `AiAgentCapability` (no new `FACILITATION_ROLES` entry — decision A).
- **Done when:** a facilitator-seat agent can author a pending proposal that shows up in the review queue ([[f-admin-surfaces]] t-3 UI) with `agent:<slug>` authorship; capability contract tests green; **gates green** before the PR.

### t-3 · Scheduled eval sweep + framework rubric judge

- **Step type** — `registerStepType('framework_eval_sweep', …)` from `initFramework()` (mirror `proactive-step.ts`), with a `configSchema` `{ score?, supervise?, rubric?, maxConversations? }` (default supervise+rubric; metric-scoring opt-in — decision resolved below). Executor: query recent framework conversations with an **un-scored** scorable turn (new `recent-conversations.ts`), loop the enabled passes, thread the execution's `userId`/`createdBy` as `actorUserId` (fallback service account), rely on the scheduler's `budgetLimitUsd` cap as the hard cost fence.
- **Rubric judge** — a seeded `eval-judge-framework-rubric` `AiAgent kind='judge'` (framework rubric as `systemInstructions`, `eval-judge-brand-voice` as the template), invoked via `driveJudgeAgent`; its score persists in a **new nullable `FrameworkConversationEval.rubricScore Float?`** column (+ reasoning into the existing `judgeReasoning` Json — "add a column, not a table").
- **Done when:** an operator can cron a one-step `framework_eval_sweep` workflow that scores only new conversations, within the execution budget cap, writing rubric scores; the seed ships no schedule row; step + query tests green; migration + boundary CI green; **gates green** before the PR.

### t-4 · Auto-embed-on-publish + outbound-webhook nudge channel

- **Auto-embed** — a `autoEmbedAfterPublish(slug, actorUserId)` helper (`void …catch(log)`) called **after commit** from `publishDraft`, `publishDefinition`, `rollback`, and the `createGraph` v1 branch; `SyncMapNodeEmbeddingsArgs.actorUserId` relaxed to `string | null` (system actor for auto-approved publishes). No debounce v1 (idempotent upsert); the on-demand route stays as the repair path.
- **Webhook nudge** — `deliverProactiveNudges` reads a fork-owned env (`FRAMEWORK_NUDGE_WEBHOOK_URL` + a `channel` selector) and, when set, POSTs one grouped payload per nudged owner (`{userId, email, journeys:[{journeyId, graphSlug, nodeKey, reason}], timestamp}`) via the escalation-notifier `fetch`+timeout+try/catch shape, alongside/instead of the email. Throttle table unchanged (channel-independent idempotency).
- **Done when:** a fresh publish auto-embeds without extending or failing the publish tx (embed failure is swallowed), and a configured webhook receives the enriched per-owner nudge; failure-isolation + env-gated-skip tests green; **gates green** before the PR.

## Alternative shapes considered

- **Keep the board's three tasks (emergence as one).** Rejected — the subject-seam migration + governance-critical pipeline/approval branches and the agent-facing capability are different machinery and different review surfaces ([[planning-retro#B25]]); bundling makes an oversized mixed PR. Split as t-1 / t-2.
- **Scheduled sweep via a raw `AiWorkflowSchedule` row.** Rejected (decision B) — a schedule needs a published workflow to point at, and there's no eval step; the fork-lawful seam is the custom step type f-overlays already established. Editing the Sunrise-core maintenance tick is off-limits.
- **A publish event-bus (`facilitation.map.published`) for auto-embed.** Rejected for v1 (decision C) — a core `HOOK_EVENT_TYPES` edit for one internal consumer; a direct post-commit call is lighter and fork-lawful. Revisit as an _upstream ask_ if a second consumer appears.
- **A settings-singleton + admin form for the webhook URL.** Rejected for v1 (decision D) — a UI surface this backend-only feature avoids; an env var suffices. Promote to a settings row only if a per-tenant/per-operator destination is needed.
- **A `subjectType`-generic `publishedVersionId` foreign key.** Rejected — it's a plain nullable String today and holding a `ModuleVersion.id`/policy id needs no relation; adding one would be a schema change for no gain.

## Open questions — resolved inline (per [[planning-retro#B20]])

Resolved at plan time so a builder doesn't relitigate; re-confirm at build only if the code contradicts.

- **Authoring-agent shape** → a **capability granted to the `facilitator` seat**, not a new `FACILITATION_ROLES` entry (the roles enum isn't a gate; a distinct persona is a leaf-app agent-config concern).
- **One `submit_proposal` tool vs per-subject tools** → **one polymorphic tool** with `proposedDefinition: z.unknown()`, delegating shape validation to the pipeline that already owns it.
- **`submit_proposal` approval** → `requiresApproval:false` (the downstream approve/publish is the gate), `isIdempotent:false` (side-effecting).
- **module_config / policy publish conflict semantics** → module_config captures + re-checks `baseVersion` (mirrors the map path); **policy is last-writer-wins (`baseVersion:null`) in v1** — a noted limitation, not a new version column.
- **Sweep re-score avoidance** → the recent-conversations query filters to conversations with a scorable turn **lacking an eval row** (natural watermark) + a `maxConversations` knob + the scheduler budget cap.
- **Which passes the sweep runs** → step `configSchema` booleans; **default supervise + rubric** (per-conversation, bounded), metric-scoring (3 calls/turn) opt-in. The rubric judge **complements** the inline supervisor rubric, not replaces it.
- **Sweep actor identity + rubric storage** → thread the execution `userId`/`createdBy` (fallback service account); **`rubricScore Float?` nullable column** + `judgeReasoning` Json (add a column, not a table).
- **Auto-embed actor on `publishDefinition` (null actor)** → relax `actorUserId` to `string | null` (system actor in the audit).
- **Auto-embed failure/cost** → fire-and-forget post-commit, `.catch(log)`, idempotent upsert, on-demand route as repair; no debounce v1.
- **Webhook nudge routing** → v1 single env-configured destination, one POST per nudged owner (carrying the `reason`/`nodeKey` the email discards); defer per-owner endpoints + admin config.

## Done when (feature)

An operator can: submit + approve structure-change proposals for **`module_config` and `policy`** subjects (not just maps), have an **agent author** proposals via a `submit_proposal` capability, run a **cron-scheduled eval sweep** that scores only new framework conversations against a **framework rubric judge** within a budget cap, and have node embeddings **auto-refresh on every map publish** plus proactive nudges optionally delivered to an **outbound webhook**. All backend, all framework-tier, all reusing shipped primitives — the two migrations touch only `framework_*` tables. **Deliberately out of scope:** any admin UI (this is backend-only; a webhook-config UI, per-owner endpoints, and a policy proposal version column are deferred). Expected pure framework-tier — confirm per [[planning-retro#B17]] at each task; ledger any upstream ask that surfaces (the publish-event hook is the likeliest candidate).

## References

- [[plan#23 · `f-governance-plus` — additive backend enhancements|plan.md feature 23]] — parent.
- [[f-emergence]] — the `StructureChangeProposal` pipeline + the `subjectType` seam t-1 widens and the authoring gap t-2 fills.
- [[f-eval]] — the on-demand scorers t-3 loops on a schedule + the rubric-judge deferral.
- [[f-overlays]] — the on-demand embed + email-only nudge t-4 extends; the proactive-sweep step-type pattern t-3 mirrors.
- [[f-module-config]] / [[f-policies]] — the config/policy apply-services t-1 reuses for the new subjects.
- [[f-admin-surfaces]] — the shipped proposal review UI (t-3 there) that surfaces the proposals t-1/t-2 create.
- [[building-a-feature]] — the execution rhythm every task follows.
- [[planning-retro]] — fold execution lessons here at close-out (§B).

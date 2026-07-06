---
name: Daybreak
category: expert-led-apps framework
status: in flight
host_platform: sunrise (separate fork)
sunrise_baseline: Sunrise v0.5.0 (f-seams landed via #373)
opened: 2026-06-23
restructured: 2026-06-24
renamed: 2026-06-30 (→ Daybreak)
spec: framework-architecture.md (rev 16)
epic: Framework v1
---

# Daybreak — development plan

> The working plan for building **Daybreak** — the expert-led-apps framework layer (Modules + Facilitation Structures + Data-Slots) — on a **separate fork of Sunrise**. The authoritative design is [[framework-architecture|framework-architecture.md]] (rev 16); this is the _build breakdown_. Structured to match the [[v1-requirements|HCE Hub]] working model — until the Hub exists, this markdown is the system of record.

## How to read this — the working model

This plan uses the Hub's levels, with each level meaning exactly what it means in the Hub:

- **Task = one PR.** The unit of work. Not a commit (commits live below this plan's resolution). A task is a cohesive, reviewable change that merges in one sitting.
- **Feature = the unit of ownership.** One owner, a coherent capability, ~2–5 tasks, with explicit `depends on` edges. **This is the working atom** — the thing you claim, prioritise, and advance. Features are a _flat list_; their order emerges from dependencies, not from any grouping.
- **Phase = an epic.** Coarse and organisational, _not_ gating and _not_ a dependency unit ([[v1-requirements#10. Initial data model sketch|per the Hub spec]]). **This entire build is one phase: `Framework v1`.** Later efforts (the relationship/cohort overlay; adjacent commercial/identity/comms components) are separate **parked** phases.

**On the spec's "six phases".** [[framework-architecture#10. Suggested build sequence|§10 of the spec]] sequences the build in six steps. That is a _suggested build order_, not a Phase structure — it re-expresses itself here as the **dependency graph between features**. Don't let it impose six buckets; there are no buckets, just features and their dependencies (the spec sequence is why `f-engine` depends on `f-map`, etc.).

- **Intent over prescription.** Each feature captures _what_ and _why_. The binding _how_ lives in [[framework-architecture]] (Appendix A). Implementation choices are made at the moment of work by the owner + Claude.
- **Stable identifiers.** Features use semantic slugs (`f-engine`, `f-slots`); tasks are `t-N` under their feature (matching the Hub). Reference a feature by slug: _"let's plan f-engine."_
- **Decisions and work-to-date are first-class** — see the logs at the end. Append, don't rewrite. The plan is allowed to be wrong; edit as insight arrives.

## Project

| Field                   | Value                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                    | **Daybreak** (the expert-led-apps framework)                                                                                                                                                                                                                                                                                                                     |
| Active epic             | **Framework v1** (the whole build below)                                                                                                                                                                                                                                                                                                                         |
| Spec                    | [[framework-architecture]] rev 16 (Binding decisions in Appendix A)                                                                                                                                                                                                                                                                                              |
| Repo                    | `human-centric-engineering/daybreak` — fork of `human-centric-engineering/sunrise` (tracking `upstream`, at Sunrise v0.5.0)                                                                                                                                                                                                                                      |
| Placement               | Separate fork of Sunrise, **not** core ([[placement-decision-memo                                                                                                                                                                                                                                                                                                | decision 2026-06-23]]) |
| Relationship to Sunrise | [[building-on-sunrise]], one level up: fix-in-place → classify → promote generic upstream; Hub-coordinated                                                                                                                                                                                                                                                       |
| First app               | Lelanea (transcendental coaching) — forks this framework repo                                                                                                                                                                                                                                                                                                    |
| Lead                    | Simon Holmes                                                                                                                                                                                                                                                                                                                                                     |
| Status                  | `in flight` — `f-seams` + `f-bootstrap` + `f-module-core` + `f-map` + `f-slots` + `f-journey-state` + `f-engine` + `f-slot-capture` + `f-module-bindings` + `f-module-config` + `f-guidance` **shipped**; `f-facilitation-agents` (John) + `f-ops-views` (Simon) **in flight**; **3 features available to claim** (`f-engagement`, `f-map-editor`, `f-overlays`) |

---

## Concept and intent

The framework adds a layer _above_ Sunrise's orchestration platform that turns agents, capabilities, knowledge, and workflows into a coherent, guided, personalised experience. It is **domain-agnostic**: every app is configuration and content, never framework code. Three new platform domains compose the two that already exist (Knowledge Base, Agents):

- **Modules** — registered, bounded feature units with universal controls + per-module Zod-schema parameters; agents/workflows/knowledge attach by _binding_, never ownership.
- **Facilitation Structures** — a versioned typed-graph **map**, per-user **journey state** (insert-only event log), a deterministic **engine** (sole writer of state), an advisory **guidance** layer, and **governance**.
- **Data-Slots** — what the system learns about the user: insert-only versioned values with confidence, source type, and per-version provenance.

Two organising decisions (spec §3): **definition vs state everywhere**; and **code-first modules**. See [[framework-architecture]] for the full design and Appendix A (every binding decision).

## Relationship to Sunrise

The framework lives in its **own fork/repo of Sunrise** ([[placement-decision-memo|2026-06-23]]). Two generic seams land _in Sunrise core_ first (`f-seams`), then the fork is taken. The framework touches Sunrise only through registration seams, enforced by an ESLint + CI boundary from the start ([[framework-architecture#Appendix B]], X6) — for _merge-survivability_, not deletability. When the framework needs something generic: fix-in-place → classify → promote the generic part upstream.

### Inherited Sunrise improvements (assumed landed before forking)

The earlier nine open Sunrise issues are assumed cleared before the fork. Five are _leveraged_:

| Sunrise issue                                                                     | Where the framework uses it                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #307 provider-enforced structured output                                          | `f-slot-capture` — `fill_slot` forwards the slot's Zod schema, killing field-name drift                                                                                                                                                                                                           |
| #304 `runtimePromptManaged` honesty flag                                          | every agent that builds its prompt per-call (`f-module-bindings`, `f-facilitation-agents`, `f-emergence`) sets it                                                                                                                                                                                 |
| #303 `isSystem:false` app-agent seed scaffold                                     | all framework agent seeds use the scaffold, never copy a core seed                                                                                                                                                                                                                                |
| #305 `NEXT_PUBLIC_APP_NAME` brand seam                                            | `f-bootstrap` and each app rebrand via env var                                                                                                                                                                                                                                                    |
| **#368 `executeTransaction` accepts tx options** (timeout/maxWait/isolationLevel) | boot-time bulk upserts — module sync (`f-module-core`), slot-definition registration (`f-slots`), map snapshot writes (`f-map`) — are the _same_ many-row interactive-transaction shape that hit P2028 on ConQuest; Daybreak raises the ceiling via this option instead of carrying a local patch |

### Three new fork-readiness issues (#366 / #367 / #368) — sequencing

Filed against Sunrise on 2026-06-30 while building ConQuest. They split cleanly by whether they gate Daybreak's fork:

- **#368 — land upstream _before_ forking.** A real bug, tiny, additive, backward-compatible, generic. Daybreak provably hits the identical P2028 (bulk module/slot/map writes at boot), so it joins `f-seams` at the "must land before the fork" bar. Then Daybreak pulls it in on day one rather than patching `lib/db/utils.ts` locally.
- **#366 / #367 — do _not_ block the fork; merge down when landed.** Authorization-scoping seams (#366 org/tier axis; #367 intra-tenant ownership-scope). Reasons not to gate: both are still `proposal`-status with an open design decision (the better-auth `organization`-plugin fork-in-the-road); they touch `lib/auth/` + ~190 call sites (slow); and they are **largely irrelevant to Daybreak v1**, which is single-user, single-tenant (Lelanea). They are designed as inert seams (no-ops in single-tenant mode), so when they land they merge down as pristine no-ops — zero friction, because Daybreak never edits `lib/auth/` either way.

> **Coordination, not a blocker — #367 ↔ `f-journey-state`.** #367's resolver and Daybreak's `canRead(viewer, subject, scope)` ([[framework-architecture#8. The relationship & cohort overlay — a designed seam, not a built feature|§8]], X2) are the **same predicate** at two layers: _one predicate, three orthogonal inputs_ — tier (#366), ownership (#367), org (multi-tenancy playbook). When we build [[#09 · `f-journey-state` — journey state + access discipline|f-journey-state]], `canRead` must be shaped to _compose with_ that upstream resolver, **not** as a framework-private parallel scope-check that later needs reconciling. #367's driver (different leaders each owning their own resources in one install) is the direct precursor to §8's per-subject and cohort-facilitator visibility, so the seam is shaped for it now even though Lelanea doesn't exercise it.

---

## Features (epic: Framework v1)

A flat list, shown in rough dependency order (most-ready first), the way the Hub would sort it. Order is _emergent from `depends on`_, not prescriptive — the [[#3. Human-centric principles|exploratory-ordering principle]] holds. PR counts are indicative sizing. The **Owner** and **Status** columns are the at-a-glance board: who holds what, and what's free to claim (see [[#Board — status &amp; claiming|the board legend]] below the table).

| #   | Feature                 | Owner           | Status                                          | Depends on                                                   | ~PRs | Capability                                       |
| --- | ----------------------- | --------------- | ----------------------------------------------- | ------------------------------------------------------------ | ---- | ------------------------------------------------ |
| 01  | `f-seams`               | Simon (Sunrise) | **shipped** (v0.5.0)                            | —                                                            | 2    | Two generic Sunrise core seams (pre-fork)        |
| 02  | `f-bootstrap`           | Simon Holmes    | **shipped** (#4/#6/#8/#9)                       | f-seams                                                      | 4    | Fork + framework skeleton + enforced boundary    |
| 03  | `f-module-core`         | Simon Holmes    | **shipped** (#10 / #11 / #12)                   | f-bootstrap                                                  | 3    | Module definition, registry, seam, liveness      |
| 04  | `f-map`                 | Simon Holmes    | **shipped** (#16 / #20 / #21)                   | f-bootstrap ✅                                               | 4    | Facilitation map: schema, versioning, format     |
| 05  | `f-slots`               | John            | **shipped** (#19 / #22 / #24)                   | f-bootstrap ✅                                               | 3    | Slot definitions + insert-only values            |
| 06  | `f-module-config`       | Simon Holmes    | **shipped** (#56 / #58)                         | f-module-core ✅                                             | 4    | Generic Zod config form + config versioning      |
| 07  | `f-module-bindings`     | Simon Holmes    | **shipped** (#33 / #35 / #50 / #53)             | f-module-core ✅                                             | 4    | Agent / workflow / knowledge bindings            |
| 08  | `f-engagement`          | _unclaimed_     | **available** ▲                                 | f-module-core ✅                                             | 3    | Engagement event stream + stats + feedback       |
| 09  | `f-journey-state`       | John            | **shipped** (#27 / #28)                         | f-map ✅                                                     | 3    | Journey state models + access discipline         |
| 10  | `f-slot-capture`        | John            | **shipped** (#42 / #43 / #44 / #45 / #46)       | f-slots ✅                                                   | 3    | `fill_slot` / `get_state` capture capabilities   |
| 11  | `f-engine`              | John            | **shipped** (#34 / #36 / #37 / #38)             | f-map ✅, f-journey-state ✅                                 | 5    | Deterministic engine + GraphStore                |
| 12  | `f-guidance`            | John            | **shipped** (#49 / #51 / #52 / #57 / #59 / #61) | f-engine ✅, f-slot-capture ✅                               | 6    | Guidance service, capabilities, chat injection   |
| 13  | `f-facilitation-agents` | John            | **in flight**                                   | f-guidance ✅                                                | 3    | Facilitation agent family + surface-scoping      |
| 14  | `f-map-editor`          | _unclaimed_     | **available** ▲                                 | f-map ✅, f-engine ✅                                        | 5    | Map editor + journey dry-run simulator           |
| 15  | `f-ops-views`           | Simon Holmes    | **in flight**                                   | f-module-config ✅, f-module-bindings ✅, f-journey-state ✅ | 5    | Module admin + journey explorer                  |
| 16  | `f-atlas`               | _unclaimed_     | blocked → f-facilitation-agents                 | f-module-bindings ✅, f-facilitation-agents, f-slots ✅      | 3    | Framework atlas (composition view)               |
| 17  | `f-policies`            | _unclaimed_     | blocked → f-facilitation-agents                 | f-facilitation-agents                                        | 4    | Typed facilitation policy kinds                  |
| 18  | `f-emergence`           | _unclaimed_     | blocked → f-facilitation-agents                 | f-engine ✅, f-facilitation-agents                           | 4    | Structure-change proposal pipeline + eval wiring |
| 19  | `f-overlays`            | _unclaimed_     | **available** ▲                                 | f-guidance ✅                                                | 3    | pgvector similarity + proactive guidance         |

**Critical path:** `f-seams → f-bootstrap → f-module-core/f-map → f-journey-state → f-engine → f-guidance → f-facilitation-agents`. Admin (14–16) and governance (17–19) hang off that spine and parallelise once it exists.

### Board — status & claiming

**Legend.** `shipped` — merged to `main`. `in flight` — an owner is actively building it (its promoted tasks live in the feature's detailed plan). `available` ▲ — every dependency is shipped and no one owns it: **free to claim now**. `blocked → X` — waiting on feature X to ship.

**Claimable right now (▲) — three open features.** **`f-guidance` (12)** is now **shipped** (#49 / #51 / #52 / #57 / #59 / #61; detailed plan: [[f-guidance]]) — the advisory layer is complete: the pure `guidance.ts` service (assembler + recency-weighted ranking + synopsis), the built-in guidance capability family agents consume (`get_journey_state` / `get_next_steps` / `get_progress_synopsis` / `suggest_focus` / `request_transition`), per-turn module + per-user context injection (a fork-carried core context-contributor widening, ledgered [[upstream-asks]]), and the X5 surface-scoped chat route that populates `scope.moduleSlug` — completing f-module-bindings' scope-refusal enforcement. It was the **last blocker on `f-facilitation-agents` (13)** and **`f-overlays` (19)**: **f-facilitation-agents is now claimed by John and in flight** (detailed plan: [[f-facilitation-agents]]) — the facilitation agent family (onboarding/orientation/synopsis/state/path + the facilitator/supervisor persona) bound via the module-binding pattern and granted the guidance capabilities, plus facilitation surface-scoping; **f-overlays (19)** is now **available ▲**. **`f-module-bindings` (07)** + **`f-module-config` (06)** are **shipped** (Simon; #33/#35/#50/#53 and #56/#58) — a registered module is fully functional (seat bindings, namespaced capabilities, module-event workflows, knowledge scope) and operator-configurable (per-module Zod config, versioned via `ModuleVersion`); together they unblocked **`f-ops-views` (15)** (now **claimed by Simon and in flight**, detailed plan: [[f-ops-views]] — the module admin + structural journey explorer that mount 06's config form and 07's binding UIs) + **`f-atlas` (16)** (16's only remaining blocker is f-facilitation-agents). The three unclaimed, claimable features — **`f-engagement` (08)**, **`f-map-editor` (14)**, and **`f-overlays` (19)** (pgvector similarity + proactive guidance) — are mutually independent and run in parallel. Shipped so far: `f-seams` · `f-bootstrap` · `f-module-core` · `f-map` · `f-slots` · `f-journey-state` · `f-engine` · `f-slot-capture` · `f-module-bindings` · `f-module-config` · `f-guidance` (#49 / #51 / #52 / #57 / #59 / #61).

**To claim a feature:** put your name in its **Owner** cell + set **Status** to `in flight`, then write its detailed plan (`.context/framework/planning/<feature>.md`, following [[f-module-core]] / [[f-map]]) and promote its first tasks — and **push the claim + plan as a standalone docs PR _before_ starting any task work** (so the claim is visible and two owners don't start the same feature; see [[building-a-feature]] step 1). Flip the feature to `shipped` when its last task's PR merges. One owner per feature (the unit of ownership); tasks within a feature are the PR-sized units that owner advances. Suggested split with **John** joining: the claimable features are mutually independent, so different owners can build them in parallel without stepping on each other — e.g. one takes `f-slots`, another `f-module-config`.

---

### 01 · `f-seams` — Sunrise core seams (pre-fork)

_Owner:_ Simon (Sunrise) · _Status:_ **shipped** (Sunrise v0.5.0) · _Depends on:_ — · _~2 PRs_

The framework's only two core touch-points, PR'd to Sunrise _before_ forking (verified absent, June 2026). Generic, so they belong upstream.

- **t** — `CapabilityContext.scope?: Record<string,string>` added (`lib/orchestration/capabilities/types.ts`), populated by the dispatcher; CHANGELOG + contract. Generic map, no framework vocabulary.
- **t** — Context-contributor registry on `buildContext()` (`registerContextContributor(type, loader)`); fork-owned `lib/app/context-contributors.ts` scaffold + `initAppContextContributors()`; CHANGELOG + contract.

_Done when:_ both merged to Sunrise `main`; vanilla behaviour unchanged.

### 02 · `f-bootstrap` — fork + skeleton + boundary

_Owner:_ Simon Holmes · _Status:_ **shipped** (#4 / #6 / #8 / #9) · _Depends on:_ f-seams · _~4 PRs_ · **detailed plan: [[f-bootstrap]]**

The framework repo's home and its enforced boundary.

- **t** — Fork Sunrise (post-seams, with #368 `executeTransaction` options landed); apply `NEXT_PUBLIC_APP_NAME` (#305); document the `framework ← Sunrise` upstream-merge procedure (`.context/framework/upstream.md`).
- **t** — `lib/framework/` skeleton (`modules/`, `facilitation/`, `data-slots/`, `shared/`); `shared/scope.ts` owns the scope vocabulary; empty `framework-*.prisma` files registered.
- **t** — Boundary enforcement (X6): ESLint rule over all framework paths both directions + CI; migration-hygiene CI check; "zero framework vocab in Sunrise code" check. Must _fail_ on a deliberate cross-boundary import.
- **t** — `initFramework()` wiring (registers an empty context contributor); `.context/framework/` doc namespace; unit + integration test scaffolding.

_Done when:_ fork builds/boots; boundary checks green and provably catch violations; empty schema migrates clean.

### 03 · `f-module-core` — module definition, registry & liveness

_Owner:_ Simon Holmes · _Status:_ **shipped** (t-1 #10 · t-2 #11 · t-3 #12) · _Depends on:_ f-bootstrap · _~3 PRs_ · **detailed plan: [[f-module-core]]**

The code-first module spine (spec §4): code defines the module; the DB row holds only operator config.
**First pure framework-tier feature — no Sunrise touch-point, so no upstream issue.**

- **t-1** — Registration → row: `ModuleDefinition` + `registerModule()` + registry **+** `Module` model (`framework_module`, free-form `String` status per X1) + boot-time upsert-by-slug sync (`syncFramework()` after `initLeafApp()`) + `isRegistered` handling + register→row proof test (+ the plan doc, folded in).
- **t-2** — Module liveness: pure `isModuleLive(module, flags, now)` (status × flag × window, A5) with an optional entitlement-predicate seam (C1); permutation tests.
- **t-3** — Read API (`GET /api/v1/admin/framework/modules`) + demo fixture **tests-only** (no live row), proving registration → row → admin visibility end-to-end.

_Sizing: the rev-16 spec's four indicative tasks fold to **three** promoted PRs — the registry-only task was commit-sized and inert without its sync ([[planning-retro#B1 · Sizing self-check when promoting tasks]]), so it ships with the model+sync as one "code → row" vertical._

Three forkability reconciliations vs the rev-16 spec (decided 2026-07-02, see decisions log): demo is
tests-only (fork boots to an empty modules table); admin visibility is a read API not a page (UI →
`f-ops-views`); the leaf registers modules from the single `initLeafApp()` hook, not a per-concern
`lib/app/modules.ts` scaffold.

### 04 · `f-map` — facilitation map

_Owner:_ Simon Holmes · _Status:_ **shipped** (t-1 #16 · t-2 #20 · t-3 #21) · _Depends on:_ f-bootstrap · _~4 PRs (3 promoted)_ · **detailed plan: [[f-map]]**

The authored typed-graph, whole-map snapshot versions (F1/F2). Pure framework-tier (no Sunrise
touch-point, no upstream issue). Shipped the models + version service (draft/publish/rollback) + the
node/edge/region/condition **format** + format-level publish validation + the admin API; the canvas
editor is `f-map-editor` (14) and graph-invariant checks (cycles/reachability) are `f-engine` (11).
**Unblocks `f-journey-state` (09).**

- **t** — `FacilitationGraph` + `FacilitationGraphVersion` models (mirror `AiWorkflowVersion`); draft-on-edit / publish / rollback.
- **t** — Node/edge JSON format: stable `key`s, node types, `completionMode`, `onFirstArrival`, **region containers** first-class (F5).
- **t** — Typed edges (four only, F3) + the family-tagged `condition` format (`state|slot|temporal`, F4) with publish-time rejection of unknown families.

### 05 · `f-slots` — slot definitions + values

_Owner:_ John · _Status:_ **shipped** (t-1 #19 · t-2 #22 · t-3 #24) · _Depends on:_ f-bootstrap · _~3 PRs_ · **detailed plan: [[f-slots]]**

The data-slot shape the other layers need (spec §6); deep capture-loop design deferred (§9.1).

- **t** — `SlotDefinition` (scope/visibility/mode/dataType/sensitivity/priorityWeight).
- **t** — `SlotValue` insert-only (version/value/valueJson/confidence/sourceType/provenance/supersededAt) + indexes incl. `@@index([userId, capturedAt])`; erasure hooks + cascade.
- **t** — Module-declared slot registration: `slotDefinitions` in `ModuleDefinition` upserted at boot, scoped `module:<slug>`.

### 06 · `f-module-config` — config form + versioning

_Owner:_ Simon Holmes · _Status:_ **in flight** · _Depends on:_ f-module-core ✅ · _~4 PRs (2 promoted)_ · **detailed plan: [[f-module-config]]**

Generic admin config from each module's Zod schema (A4) + config versioning (A10). **API-first: ships
the config-validation + versioning engine (incl. the server-side Zod→field-descriptor walker that is
A4's substance); the client generic-form + version-history tab are `f-ops-views` (15)** — the same
read-API-here / UI-there split 03 and 07 made. **Unblocks `f-ops-views` (15).**

- **t-1** — `ModuleVersion` snapshot table + config-versioning service: validate an operator write
  against the registered module's `configSchema` (A4), write `Module.config`, snapshot a point-in-time
  version (the `AiAgentVersion` model — no draft buffer; **restore**, not rollback); `createdBy` hand-FK; audit.
- **t-2** — Zod→descriptor walker (schema → renderable field descriptors, the A4 engine) + config +
  version-history admin APIs (`[slug]/config` GET/PUT · `[slug]/versions` GET · `.../[version]/restore` POST).

### 07 · `f-module-bindings` — agent / workflow / knowledge bindings

_Owner:_ Simon Holmes · _Status:_ **shipped** (#33 / #35 / #50 / #53) · _Depends on:_ f-module-core ✅ · _4 PRs_ · **detailed plan: [[f-module-bindings]]**

Attach by binding, not ownership (A6); the module spine's second half — makes a registered module _functional_. **API-first: ships the binding APIs; the binding UI is `f-ops-views` (15)**, the same split f-module-core made (read API here, page there). Unblocks `f-atlas` (16).

- **t-1** — `ModuleAgentBinding` pivot (role/seat, `isPrimary`, `config`) + `ModuleDefinition.agentRoles` + bind-time role validation + admin binding **API** (seat-binding UI → f-ops-views); `runtimePromptManaged` (#304) honoured, framework agent seeds are f-facilitation-agents.
- **t-2** — Module-declared capabilities into the global registry namespaced `module-slug.tool` (A8), registered from the framework's own boot path; a scope-refusal helper reads `scope.moduleSlug` via the `f-seams` map so a capability can refuse out-of-scope (the live `scope` population is f-guidance's X5 surface-scoping — seam shaped here).
- **t-3** — `ModuleWorkflowBinding` (event → workflow) mirroring `AiWorkflowTrigger`, dispatched via `drainEngine` (the hook system is outbound-only); the module-lifecycle event _source_ is coordinated with f-engagement (08).
- **t-4** — Knowledge grants: bound agents get doc/tag access via the existing restricted-access system ("no new mechanism at all") — thin, may fold into t-1.

### 08 · `f-engagement` — event stream + stats + feedback

_Owner:_ TBD · _Depends on:_ f-module-core · _~3 PRs_

Stats from an insert-only stream, never counters (A9). Shares `JourneyEvent` with the journey log (§4.3 = §5.4).

> **Coordination — `JourneyEvent` is created by [[#09 · `f-journey-state` — journey state + access discipline|f-journey-state (09)]], not here.** The shared stream ships with the journey-state models (09 is in flight now). It is **`userId`-keyed with a hand-FK cascade + optional `journeyId`** — the shape that holds both journey-traversal events (which set `journeyId`) and this feature's non-journey engagement events (`session.started`, module lifecycle — `journeyId` null) while keeping every row erasable (the §4.3-vs-§5.2 key-column reconciliation; see the decisions log). `f-engagement` **extends its _use_, not its schema**: module-lifecycle event types (`type` is a free-form `String`, X1 — new kinds are not migrations) + stats aggregation over the stream. So this feature's t-1 below becomes "dispatch module-lifecycle events into the existing `JourneyEvent` table + the stats read side", not "create the table". No hard dependency edge (small additive create; whichever of 08/09 ships first would own it, and 09 is in flight).

- **t** — Module lifecycle events dispatched via the event-hook system into `JourneyEvent` (created by `f-journey-state`); `journeyId` left null for non-journey engagement. **This same module-lifecycle dispatch point is the trigger for [[#07 · `f-module-bindings` — agent / workflow / knowledge bindings|f-module-bindings (07)]]'s `ModuleWorkflowBinding`** — firing a module event should also call `runModuleWorkflowBindings(moduleSlug, eventType, payload)` (07 t-3), so an admin's "when X happens in this module, run workflow Y" actually fires. (Coordination, not a hard dep edge — same pattern as `JourneyEvent` with 09; whichever of 07/08 lands the shared emit point owns it. Note 07 reconciliation #4: the hook system is **outbound-webhook-only**, so "run workflow" goes via `drainEngine`, not a hook action.)
- **t** — `record_feedback` framework capability + a plain feedback API endpoint.
- **t** — Admin module stats (users, entries, completion, dwell, return, ratings) computed from the stream.

### 09 · `f-journey-state` — journey state + access discipline

_Owner:_ John · _Status:_ **shipped** (t-1 #27 · t-2 #28) · _Depends on:_ f-map · _~3 PRs (2 promoted)_ · **detailed plan: [[f-journey-state]]**

Per-user state on the satellite convention + the access seam that makes §8's relational features a one-function change later (X2/X3).

> **Design-time awareness — Sunrise #367 (and #366).** This feature builds `canRead`, which is the framework-layer instance of the **same** authorization predicate Sunrise #367 (intra-tenant ownership-scope) and #366 (org/tier axis) generalise upstream: _one predicate, three orthogonal inputs_ — tier / ownership / org. **Build `canRead` to compose with that resolver, not as a private parallel check.** Concretely: the `scope` argument is the seam that carries #367's ownership/subject input; keep it an open, structured value (not a hard-coded `viewer === subject`) so that when #367 lands, wiring it in is supplying an input to an existing predicate, not a rewrite. Check #367's resolved shape before finalising the signature — if it has landed upstream by then, delegate to it; if not, mirror its _one predicate, three inputs_ contract so the later merge is additive. This is the wider-application requirement (multi-leader, owner-scoped, eventually cohort-facilitator visibility) designed in from day one even though Lelanea is single-user. See [[framework-architecture#8. The relationship & cohort overlay — a designed seam, not a built feature|§8]] and the [[#Three new fork-readiness issues (#366 / #367 / #368) — sequencing|sequencing note]] above.

- **t** — `UserJourney` (non-nullable `contextKey @default("")`, X3) + `UserNodeState` projection + extend `JourneyEvent` use; satellite FK + cascade + erasure hook.
- **t** — `canRead(viewer, subject, scope)` single access function; route every journey/slot read through it. **Shape `scope` to admit #367's ownership input** (own / team / all) and #366's tier input so the function composes with the Sunrise resolver rather than duplicating it; one user equals subject today, but the contract is the three-input predicate, not a hard equality.
- **t** — Subject-scope filter on analytics queries from the start (one user now; owner/team/cohort later — the same #367 axis at the analytics layer).

### 10 · `f-slot-capture` — capture capabilities

_Owner:_ John · _Status:_ **shipped** (#42 / #43 / #44 / #45 / #46) · _Depends on:_ f-slots ✅ · _5 PRs_ · **detailed plan: [[f-slot-capture]]**

Silent capture riding the existing tool loop (D5); leverages #307.

- **t** — `get_state()` + `fill_slot(...)` as `BaseCapability`s; validate against definition or mint open-mode slug; write next version; silent in conversation; `processesPii=true` + `redactProvenance`.
- **t** — Sensitivity-driven masking-before-storage (`special_category` strictest); `fill_slot` extraction forwards the slot's Zod schema as enforced structured output (#307).
- **t** — Selective per-agent exposure via grant `customConfig` (which groups/scopes an agent may read/write), enforced inside the capability.

### 11 · `f-engine` — deterministic engine + GraphStore

_Owner:_ John · _Status:_ **shipped** (t-1 #34 · t-2 #36 · t-3 #37 · t-4 #38) · _Depends on:_ f-map, f-journey-state · _~5 PRs (4 promoted)_ · **detailed plan: [[f-engine]]**

The deterministic spine (spec §5.3), pure and LLM-free; sole writer of state (F11). One coherent capability.

- **t** — `GraphStore` interface + Postgres recursive-CTE impl (reachability, neighbours, paths) + tests (F8).
- **t** — Availability computation: typed-edge + state- + slot-predicate evaluation, with explainable lock reasons.
- **t** — Temporal predicates + timezone-resolved `now` per journey (C7).
- **t** — Transition validation (`applyEvent`): once/repeatable semantics, single-transaction event + projection write, structured rejections.
- **t** — Publish-time invariant validation: cycles, unreachable-required, live-state key-removal warnings (shared with `f-emergence`).

### 12 · `f-guidance` — guidance service, capabilities & chat injection

_Owner:_ John · _Status:_ **shipped** (#49 / #51 / #52 / #57 / #59 / #61) · _Depends on:_ f-engine ✅, f-slot-capture ✅ · _6 PRs_ · **detailed plan: [[f-guidance]]**

Engine computes what's possible; guidance ranks what's wise; agents narrate (F12). First moment it's _felt_ in conversation.

- **t** — `guidance.ts` ranking already-eligible options using recency-weighted slot reads; reasons in payload.
- **t** — Capability family: `get_journey_state`, `get_next_steps`, `get_progress_synopsis`, `suggest_focus`, `request_transition` — built-in `BaseCapability`s, granted per agent.
- **t** — Register the framework context contributor via the `f-seams` registry; inject module scope + journey position + fresh slots per turn.
- **t** — Surface-scoped conversations (X5): each module/facilitation surface its own `AiConversation` with its bound agent; continuity carried by state, not threads. **This is where `scope.moduleSlug` gets _populated_** (set `ChatRequest.scope` when opening a module surface) — which **completes the enforcement half of [[#07 · `f-module-bindings` — agent / workflow / knowledge bindings|f-module-bindings (07)]]'s** scope-refusal seam: 07 shipped (in #35) the `isInModuleScope` predicate that _reads_ `scope.moduleSlug`, but a module capability only actually refuses out-of-scope once this task writes it (07 reconciliation #3). 07's interim posture is absent-scope → allow; leave it (a global flip to refuse-on-absent is `f-policies`' call and breaks 07's tests — see [[f-guidance]] decision 7).
- **t** — Boundary test: a strip of the framework leaves `buildContext()` with one fewer contributor (proves the seam stayed clean).

### 13 · `f-facilitation-agents` — facilitation agent family

_Owner:_ John · _Status:_ **in flight** (dep f-guidance shipped ✅) · _Depends on:_ f-guidance ✅ · _~3 PRs_ · **detailed plan: [[f-facilitation-agents]]**

Same binding pattern as modules, second scope (one mechanism, two scopes).

- **t** — `FacilitationAgentBinding` (agentId, role); bind the family (onboarding, orientation, synopsis, state, path/progress, facilitator persona) granted the guidance capabilities.
- **t** — Agent seeds via the `isSystem:false` scaffold (#303); `runtimePromptManaged` set (#304).
- **t** — Per-scope guard settings (sensitive scopes get stricter inline guards — sets up `f-policies`).

### 14 · `f-map-editor` — map editor + dry-run simulator

_Owner:_ _unclaimed_ · _Status:_ **available to claim** ▲ (deps `f-map` + `f-engine` shipped) · _Depends on:_ f-map, f-engine · _~5 PRs_

Authoring tools on the engine (spec §5.6). **Note:** Sunrise's workflow builder is built on **`@xyflow/react`** (v12) — `components/admin/orchestration/workflow-builder/` (`ReactFlow` + `Background`/`Controls`/`MiniMap`, `node-types/`, `edge-types/`, `workflow-mappers.ts`); reuse those primitives. _(Corrects an earlier "custom canvas, not React Flow" note — re-verified 2026-07-06 against `package.json` + `workflow-canvas.tsx` while planning `f-ops-views`.)_

- **t** — Confirm Sunrise's builder primitives (canvas, palette, edges, config panel) + the reuse seam.
- **t** — Facilitation node/edge palette + typed-edge drawing; region collapse/expand.
- **t** — Per-node config panel (gating conditions, first-arrival, module binding); pre-publish validation surfacing (from `f-engine`).
- **t** — Version-history / publish / rollback controls.
- **t** — Journey dry-run simulator: synthetic user (completions, slots, clock) vs a _draft_ map — available/locked/why, guidance ranking, temporal-gate + policy preview (F18).

### 15 · `f-ops-views` — module admin + journey explorer

_Owner:_ Simon Holmes · _Status:_ **in flight** (deps `f-module-config` + `f-module-bindings` + `f-journey-state` all shipped ✅) · _Depends on:_ f-module-config, f-module-bindings, f-journey-state · _~5 PRs_ · **detailed plan: [[f-ops-views]]**

The operational admin surfaces — the UI half three shipped features deferred here **API-first**: `f-module-core` (03) shipped the module read API and deferred its page; `f-module-config` (06) shipped the config-validation + version engine and deferred the client form + history tab; `f-module-bindings` (07) shipped the binding APIs and deferred their management views.

**Scoped to its 08-independent core (the 08 question, settled — see the 2026-07-06 decisions-log entry).** The earlier sketch bundled `f-engagement` (08) deliverables — "stats from the event stream", "collective heat / drop-off overlays" — with no dependency edge; those are 08's stats-from-the-stream (A9), not shipped. So this feature builds the **operational admin** (module list/detail, config form, binding views, module lifecycle writes) + a **structural** journey explorer (read-only map + _individual_ replay over 09, whose events `f-engine` already writes). 08's **analytics surfaces move to 08**, mounting **additively** onto this feature's host surfaces later — **host-first, overlay-plugs-in**: 15 leaves the extension points (a tab-array slot + a canvas overlay prop), and 08's free-form `JourneyEvent.type`s (X1) flow into the timeline with zero rework.

Promoted to **5 tasks** along the cleanest seam — UI-over-shipped-API vs builds-one-new-endpoint (isolating the security-sensitive `DELETE` + invalidation as its own task). Promoted-task table lives in [[f-ops-views]].

- **t-1** — Framework admin **scaffolding + nav seam** (fill `lib/app/admin-nav.ts` → a new client-safe `lib/framework/admin-nav.ts`, delegating to a leaf-reserved `lib/app/leaf-admin-nav.ts` — the boot-seam pattern applied to client nav) + the module **list** page (`app/admin/framework/modules/`, the first framework admin page) over `GET /modules`.
- **t-2** — Module **detail** shell (tabbed, the `agent-form` multi-tab model) + **Config** tab (renders 06's `FieldDescriptor[]`, saves via `PUT /config`) + **Versions** tab (list + restore) — pure UI over 06's shipped API; ships the tab-array host.
- **t-3** — Module **lifecycle writes** (the endpoints this feature builds): `PATCH /modules/[slug]` (edit status / audience / window / name) + `DELETE /modules/[slug]` wired to `invalidateAllAgentAccess()` (the 07 hard-delete invalidation gap — the DB cascade runs no app code) + a **Settings** tab + danger-zone delete.
- **t-4** — **Binding** management tabs (Agents / Workflows / Knowledge) over 07's `/modules/[slug]/{agents,workflows,knowledge}` endpoints — the binding UI deferred from [[#07 · `f-module-bindings` — agent / workflow / knowledge bindings|f-module-bindings (07)]] ([[f-module-bindings]] reconciliation #1).
- **t-5** — **Journey explorer**: the journey **read endpoints** this feature builds over 09's `canRead`-guarded queries (viewer = `{ userId, isAdminSupport: true }` from the admin session, not `role === 'ADMIN'`) + a read-only `@xyflow/react` canvas (reuse the workflow-builder canvas primitives) + individual-journey replay from the event log; subject-scope-ready queries.

### 16 · `f-atlas` — framework atlas

_Owner:_ TBD · _Depends on:_ f-module-bindings, f-facilitation-agents, f-slots · _~3 PRs_

A pure projection, zero new schema (X8): the zoomable composition view.

- **t** — One read-only endpoint assembling the composition graph from registries + binding pivots + slot definitions + workflow bindings + knowledge grants + published map.
- **t** — Semantic-zoom canvas (map → module/facilitation internals); cross-cutting lenses (agent/slot/workflow-centric).
- **t** — Click-through deep-links to the real editors (never edit-in-place).

### 17 · `f-policies` — typed facilitation policy kinds

_Owner:_ TBD · _Depends on:_ f-facilitation-agents · _~4 PRs_

Typed policy kinds under one table, not a rules blob (F14). Ships `autoApprove: none`.

- **t** — `FacilitationPolicy` table with `kind` discriminator + per-kind Zod payload; relevance/maturity gating kind (stage/region → allowed roles).
- **t** — Guard-minimums-per-scope kind (mandate inline `block`, F16).
- **t** — Escalation-pathway kind (signal → declarative response, always logged, F15).
- **t** — Auto-approval risk-class knob (ships `none`, §9.2).

### 18 · `f-emergence` — proposal pipeline + evaluation wiring

_Owner:_ TBD · _Status:_ **blocked** → f-facilitation-agents (`f-engine` shipped ✅) · _Depends on:_ f-engine, f-facilitation-agents · _~4 PRs_

Emergence through one narrow gate (F17); the spine is never written raw.

- **t** — `StructureChangeProposal` table (diff against current map/config/policy); `createdBy = "agent:<slug>"`.
- **t** — Pipeline: schema validation → engine invariant check (`f-engine`) → risk classification → approval queue → publish new version.
- **t** — Evaluation metrics (faithfulness/groundedness/relevance) + post-hoc supervisor over framework conversations.
- **t** — Judge seeds via the `isSystem:false` scaffold (#303).

### 19 · `f-overlays` — similarity + proactive guidance

_Owner:_ TBD · _Depends on:_ f-guidance · _~3 PRs_

Advisory overlays; authored edges alone drive eligibility (F9).

- **t** — `framework_node_embedding` (`vector(1536)` + HNSW); embeddings per node.
- **t** — Guidance consults similarity for "related places", clearly labelled advisory.
- **t** — Proactive guidance: scheduled workflow (`AiWorkflowSchedule`) runs the same guidance evaluation over active journeys; nudges via existing hooks/notifications (F13).

---

## Parked phases (future epics)

Per the Hub's `parked` Phase status — carried so they're not lost, kept out of the active view:

- **Relationship & cohort overlay** (spec §8) — cohorts, membership, `JourneyLink` with consent (legal-reviewed, §9.3). Enabling seams (`contextKey`, `canRead`, subject-scope) ship inside `f-journey-state` / `f-ops-views`, so this epic is additive when an app triggers it.
- **Adjacent components** (spec Appendix C) — commercial layer, identity/consent, comms channels, media/voice, trust & safety ops, product analytics. Each a sibling component with a narrow interface to the framework; none scheduled until an app needs it. Two interfaces are pre-wired: entitlements (module liveness) and timezone-resolved `now`.

---

## How features and tasks work

> This section is the **structure** (levels, statuses, sizing). For the **execution rhythm** — how to
> take a feature from claim to shipped (plan-first → per-task gate loop → close-out) — see
> [[building-a-feature]]. New contributors (and their agents): read that first.

### Status vocabulary

- **Features:** `not started | in flight | blocked | shipped`. Owner + `depends on`; `blocked` lists what's blocking.
- **Tasks (when promoted):** `backlog | available | claimed | done`. **No `in-pr` state** — a promoted task flips straight to `done` when its PR merges. Tracking an "in-PR" step in a Markdown board wastes a second commit to flip it and, more often, gets forgotten (the status goes stale). One transition, nothing to forget.

### Task sizing — one PR, not one commit

A **task is one meaningful PR**: cohesive, reviewable, merge-in-one-sitting (often ~200–600 lines). Never a single commit — commits are below this plan's resolution. If a task reads like "add one field + test", it's a commit _inside_ a PR; fold it in. Occasionally a task is honestly larger than one PR — say so explicitly rather than pretending it's small.

### Feature sizing — the unit of ownership

A **feature is owned by one person** and is a coherent capability of ~2–5 tasks, with dependencies. It's the atom you claim, prioritise and advance — matching the grain the Hub's own project page uses. The `~PRs` figure on each feature is indicative sizing, there so the size reads at a glance.

### Indicative vs promoted tasks

The `t` bullets under each feature are **indicative** — a planning aid sketching PR-sized scope, _not commitments_. A task becomes **promoted** when the owner declares it with a stable id (`t-N`), files-likely-to-touch, deps, and status — the deliberate "this is real work now" gesture. Indicative tasks reshape on promotion; that's the point.

Promoted-task format under a feature in flight (mirrors the Hub board):

```
| ID  | Task                                   | Files                                   | Deps | Status    | PR |
|-----|----------------------------------------|-----------------------------------------|------|-----------|-----|
| t-1 | GraphStore interface + Postgres impl   | lib/framework/facilitation/graph-store/ | —    | available | —   |
| t-2 | Availability computation + reasons     | lib/framework/facilitation/engine/      | t-1  | backlog   | —   |
```

### Asking Claude to plan a feature

> "Let's plan **f-engine**. Read this plan and §5.3 + the F-decisions in [[framework-architecture]], then propose the approach."

Claude reads this doc for intent and the spec for the binding _how_, then produces an implementation plan for review.

---

## Decisions log

Append-only. Newest at the top.

- **2026-07-06 — `f-guidance` (12) **shipped** (t-1 #49, t-2 #51, t-3 #52, t-4 #57, t-5 #59, t-4b #61 all merged).** The advisory layer (spec §5.4, F12) — _the engine computes what is possible; guidance ranks what is wise; agents narrate_ — and the **first moment the experience is felt in a conversation**. **t-1** — the pure `guidance.ts` service: the `computeAvailability`/`applyEvent` **input assembler** the engine deliberately left to this feature (canRead-guarded), the recency-weighted **ranking** of the engine's already-eligible `validMoves` (reasons in the payload; a labelled-empty `related` slot for `f-overlays`; F12 never re-decides eligibility), and a deterministic **progress-synopsis** digest — no LLM (agents narrate). **t-2** — the read capability family (`get_journey_state` / `get_next_steps` / `get_progress_synopsis` / `suggest_focus`) via the framework capability seam; **t-3** — `request_transition`, the write cap over the engine's sole writer (a refusal is a structured "not yet", not an error). **t-4** — the `'module'` context contributor wired to real (user-agnostic) module context; **t-4b** — **per-user** slot injection, unblocked by a **fork-carried core-seam widening** of `buildContext` (generic `ContextRequest { userId? }` + a user-aware cache key — the #385/#403 pattern, ledgered [[upstream-asks]], empty-userId = prior behaviour, boundary CI green). **t-5** — the X5 framework-owned surface chat route that resolves a module's primary agent and **populates `scope.moduleSlug`**, completing f-module-bindings' `isInModuleScope` enforcement. Five design questions were **resolved inline (no Ultraplan)**: documented default ranking weights, deterministic synopsis, leave `isInModuleScope` allow-on-absent, one framework-owned surface route, no `dryRun`. Every task through the full gate loop; `/code-review` + `/security-review` caught real defects before merge on nearly every task — t-1 (ranking scored `related_to` edges), t-3 (`journeyStarted` doc), t-5 (**HIGH: agent-visibility bypass** — the surface exposed `internal` agents; gated on `public`; + per-agent `rateLimitRpm` ignored), t-4b (DB-error would blank the module block; + `special_category` auto-injection). Two scope reductions recorded: **pgvector "related" + proactive guidance (F13)** deferred to `f-overlays`/Phase 6, and **full journey-position-in-prompt** deferred (needs a module→graph resolve; agents get it via `get_journey_state`). **Was the last blocker on `f-facilitation-agents` (13) → now claimable, claimed by John; and `f-overlays` (19) → available ▲.** Lessons: [[planning-retro#B19 · The fork-carried core seam is the sanctioned escape hatch when no seam exists — mirror the #385/#403 shape, keep it generic, ledger it|B19]], [[planning-retro#B20 · Resolve a plan's open design questions inline, not via a separate refinement pass|B20]]. Detail: [[f-guidance]].
- **2026-07-06 — `f-ops-views` (15) claimed (Simon) + planned; scope settled to its 08-independent core, sized to 5 clean-seam tasks.** Detailed plan: [[f-ops-views]]. The operational admin surfaces — the UI half three shipped features deferred here API-first (03 module page, 06 config form + version history, 07 binding management). **Scope reconciliation (the 08 question, settled):** the board's indicative task 1 bundled `f-engagement` (08) deliverables — "stats from the event stream", "collective heat / drop-off overlays" — with no dependency edge; those are 08's stats-from-the-stream (A9), not shipped. So 15 is built to its **08-independent core** (operational admin + a **structural** journey explorer: read-only map + _individual_ replay, which `f-engine` already writes the events for), and 08's **analytics surfaces move to 08** where they mount additively onto 15's host surfaces later. **Principle — host-first, overlay-plugs-in:** a UI overlay depends on its host surface more than the host depends on the overlay's data source (the data plugs in late; an overlay is homeless without its host), so 15 (the host: module detail page + journey canvas) is built before 08's stats UI; 15 leaves the extension points (a tab-array slot + a canvas overlay prop), and 08's free-form `JourneyEvent.type`s (X1) flow into 15's timeline with zero rework — the same read-API-here / UI-there split 03/06/07 already made. **Sizing — 5 tasks along the cleanest seam** (UI-over-shipped-API vs builds-one-new-endpoint): t-1 scaffold + **nav seam** + module list; t-2 detail shell + config + versions (UI over 06); t-3 module **lifecycle writes** — `PATCH` + `DELETE /modules/[slug]` (the latter wired to `invalidateAllAgentAccess()`, the 07 hard-delete gap) — isolated as the one security-sensitive task; t-4 binding tabs (UI over 07); t-5 journey explorer — new read endpoints over 09's `canRead` queries + read-only `@xyflow` canvas + individual replay. **Nav seam resolved with no core change** (no upstream issue): Sunrise's `admin-sidebar.tsx` already calls `initAppNav()` from the empty, fork-owned `lib/app/admin-nav.ts` and its comment sanctions a fork populating the registry there — Daybreak fills it (the boot-seam #385 pattern applied to client nav; a static import since nav is sync, not the dynamic-import trick `bootstrap.ts` uses). **Expected pure framework-tier** — the two endpoint pairs 15 builds (module lifecycle writes, journey reads) are framework-tier; confirm per B17 at build. Corrects the board's stale "custom canvas, not React Flow" note for `f-map-editor` (14): Sunrise's workflow builder **is** `@xyflow/react` v12 (re-verified against `package.json` + `workflow-canvas.tsx`).
- **2026-07-06 — `f-module-config` (06) **shipped** (t-1 #56, t-2 #58 merged).** The operator-config half of the module spine (spec §4.1, A4 + A10) — closes the gap `f-module-core` left: `Module.config` + `ModuleDefinition.configSchema` existed, but nothing validated, versioned, or exposed a config edit. **t-1 (versioning spine)** — `ModuleVersion` snapshot table + the config-versioning service: a config write is validated against the module's own registered Zod schema (A4), stored on `Module.config`, and captured as a **point-in-time** `ModuleVersion` (the `AiAgentVersion` model, **not** the map/workflow draft-buffer — the live values _are_ `Module.config`, the newest version equals the live row, and "rollback" is a **restore** that snapshots forward). `createdBy` is the hand-FK-to-core pattern (plain scalar → `User`, `ON DELETE SET NULL`, no reverse field, X6); migration B13-stripped. **t-2 (the A4 engine + API)** — `describeConfigSchema`, a **Zod→field-descriptor walker** so the server serialises a module's schema to flat descriptors a client renders (the registry is server-only, so a browser can never hold the live Zod object). Built on **Zod 4's native `z.toJSONSchema()`** (not fragile `_def` introspection); bounded + total (string/number/boolean/enum, else a raw-`json` fallback, never throws). Plus the admin API: `GET/PUT /config`, `GET /versions`, `POST /versions/[version]/restore`, all `withAdminAuth`. **API-first — the client config _form_ + version-history tab defer to `f-ops-views` (15)** (the 03/07 read-API-here / UI-there precedent); the walker + `getModuleConfigForm` are the server engine those pages consume. **Pure framework-tier — no upstream Sunrise issue** (like f-module-core / f-map). Every task through the full gate loop; `/code-review` caught real defects on both (t-1: **dropped the lazy v1 "seed the pre-edit config" mechanism** — borrowed from `AiAgentVersion` but wrong for modules, whose pre-edit state is the empty `{}` boot default, so seeding fabricated an author and could produce an un-restorable v1; **+ a concurrent-save P2002→500** now mapped to a retryable error. t-2: **`z.number().int()` leaked Zod's ±MAX_SAFE_INTEGER sentinels** as form bounds; **`parseVersionParam` accepted a version above Postgres int4** → DB error/500, now a clean 400). **Unblocks `f-ops-views` (15)** — every one of its deps (f-module-config ✅, f-module-bindings ✅, f-journey-state ✅) is now shipped, so 15 is **available ▲**. Lessons: [[planning-retro#B18 · A precedent borrowed for its shape can carry a rationale that doesn't transfer — re-derive it from the new domain|B18]]. Detail: [[f-module-config]].
- **2026-07-06 — `f-module-bindings` (07) **shipped** (t-1 #33, t-2 #35, t-3 #50, t-4 #53 all merged).** The module spine's second half — a registered module becomes _functional_: it **binds** agents/capabilities/workflows/knowledge, never owns them (§4.2, A6/A7/A8). **t-1 (agent bindings)** — `ModuleAgentBinding` pivot binding an `AiAgent` into a named seat (`role` validated against `ModuleDefinition.agentRoles`), single-primary enforced by a partial unique index. **Established the hand-FK-to-core pattern that resolved the plan's back-relation open question with _no core edit_:** `agentId` is a plain scalar FK, `ON DELETE CASCADE` hand-written in the migration, no Prisma `@relation` → no reverse field on the Sunrise-owned `AiAgent` (the f-slots `SlotValue.userId` shape). t-3 reused it for `workflowId`/`createdBy`, t-4 for `documentId`/`tagId`. **t-2 (capabilities)** — module capabilities register into the **one** global dispatcher, namespaced + scope-aware. `/security-review` caught a feature-breaking dispatch bug: the handler key, `ai_capability.slug`, and `functionDefinition.name` **must be one identifier** (`module__tool`, `__` not `.` — OpenAI forbids `.`); reconciliation #2 corrected accordingly and the invariant is now unit-tested. Boot-reconcile of the `ai_capability` rows splits code-projected from operator-owned columns. **Filed Sunrise [#398](https://github.com/human-centric-engineering/sunrise/issues/398)** (a `register(cap, { slug, guard })` seam) — the namespacing wrapper's PII re-assertion is load-bearing until it lands (ledgered). **t-3 (workflow bindings)** — `ModuleWorkflowBinding` mirrors `AiWorkflowTrigger`; `runModuleWorkflowBindings(moduleSlug, eventType, payload)` dispatches each enabled binding's **published** workflow via `drainEngine` (reconciliation #4: the hook system is outbound-webhook-only, so not hooks). Added `createdBy` for run attribution; the event _source_ is coordinated with f-engagement (08), not depended-on. Also landed the **rule-of-three dedup** the t-1 review deferred: shared `route-params` + `prisma-errors` helpers, framework-tier (not core), with f-map + t-1 migrated. **t-4 (knowledge scope) — did NOT fold (B1 bet was wrong).** The premise "no new mechanism, thin, fold into t-1" was false: correct behaviour — a module owning a **durable knowledge scope** that its bound agents **inherit**, coexisting non-destructively with the operator's direct grants — is impossible to _materialise_ (the core `AiAgentKnowledgeDocument` pivot is `@@id([agentId, documentId])` with no provenance, so a module-grant and a direct grant of the same doc are the _same row_ → clobber-or-leak on unbind). So the scope is composed **live at resolve time** via a **generic core seam** `registerAgentAccessContributor` (built fork-first in `resolveAgentDocumentAccess`, minimal + generic, empty-registry = prior behaviour — the boot-seam #385 pattern), consumed by `resolveModuleKnowledgeForAgent`. **Filed Sunrise [#403](https://github.com/human-centric-engineering/sunrise/issues/403)** (ledgered); enforcement is live in the fork now. `knowledgeAccessMode` is never flipped (the agent owns its mode; the module contributes scope). **This makes the plan's "fourth pure framework-tier feature — no upstream issue" claim wrong: t-4 carries a generic core seam + one upstream issue** (t-1–t-3 were pure). Every task through the full gate loop; each `/security-review` + `/code-review` caught real defects fixed before merge (t-2 dispatch-key bug; t-3 P2003→500 + shared-helper parity; t-4 a **fail-to-revoke** window — bind/unbind must invalidate the resolver cache now that bindings feed knowledge — and a **sync-throw hole** in the seam's never-throws guard). Deferred to **f-ops-views (15)**: all binding/knowledge admin UI (API-first, the f-module-core precedent). Recorded invalidation-contract gaps for f-ops-views (module hard-delete must invalidate) + a retain-on-retire decision. **Unblocks `f-atlas` (16)** — now blocked only on f-facilitation-agents (13). Lessons: [[planning-retro#B17 · "Pure framework-tier / no upstream issue" is a build-time finding, not a plan-time fact — correct-behaviour-first can reveal a needed core seam|B17]].
- **2026-07-05 — `f-slot-capture` (10) **shipped** (t-1 #42, t-2 #43, t-3 #44, t-3b #45, t-4 #46 all merged).** The capture half of the slot subsystem — the two `BaseCapability` tools an agent invokes silently in the tool loop (D5) over the insert-only value engine `f-slots`. **t-1** — a reusable **framework capability-registration seam** (`registerFrameworkCapability` + an `ai_capability`-row sync wired into `syncFramework()`, marker-scoped so it can never hijack a Sunrise built-in or admin row), proven by `get_state` (the `canRead`-guarded read, X2; `processesPii`; silent). **t-2** — `fill_slot`, the write cap: targeted-slug validation / open-mode minting / P2002 retry over `appendSlotValue`; `redactProvenance` masks the value + a minted slug (model-authored free text that can encode PII). **t-3** — sensitivity masking-before-storage (`special_category` prose never lands at rest) + the local typed-value bridge (`SLOT_DATA_TYPE ↔ typed-value`; date restricted to ISO-8601 so the engine's lexicographic `gte`/`lte` stays chronological). **t-3b** — the #307-enforced prose→typed **extraction fallback** (a secondary `runStructuredCompletion` against the capturing agent's own provider/model, best-effort — never fails the write). **t-4** — per-agent read/write **exposure** via a grant's `customConfig` allowlist (groups/scopes; tri-state — absent = permissive, valid = enforced, malformed = fail-closed; strict facets so a typo can't silently widen access). Every task through the full `/pr-gates` suite; review caught + fixed real defects before merge on every task (t-1 sync-hijack asymmetry, t-2 minted-slug PII leak, t-3 minted-slug leak on write-failure + date lexicographic hazard, t-3b DB-lookup outside the best-effort try, t-4 fail-open facet typo). Pure framework-tier — no migration (`customConfig` already existed), no core edit (framework→core public imports only); two `upstream-asks` **ledgered** (identified, issue-to-file — relocate/widen `runStructuredCompletion`; surface binding `customConfig` into `CapabilityContext`). **Was the last blocker on `f-guidance` (12) → now available ▲**, the head of the remaining critical path. Lessons: [[planning-retro#B16 · A "masking + extraction" task splits cleanly at the LLM boundary — the pure map ships, the impure call defers|B16]].
- **2026-07-05 — `f-engine` (11) **shipped** (t-1 #34, t-2 #36, t-3 #37, t-4 #38 all merged).** The deterministic facilitation spine (spec §5.3, F11) — pure, LLM-free, the sole writer of journey state. **t-1** — the `GraphStore` interface + in-memory traversal over the parsed published map (in-memory, not recursive CTE — the F8 interface is the commitment, the impl a later swap; reachableFrom / neighbours / pathsBetween / findCycles / regions). **t-2** — `computeAvailability`, the pure explainable "what is possible now": the four F3 edge semantics + three F4 condition families (state/slot/temporal) intersected with module liveness (A5) + once-close (F6), returning per-node verdicts with every failing gate's reason (F12), `validMoves`, `firsts`; folded the board's temporal task in (B1); `resolveJourneyNow` reads `User.timezone` (§C7). **t-3** — `applyEvent`, the one validated write path: `enter` gated by availability, `complete` by an atomic conditional update (race-safe — code-review caught the double-increment), event + projection in one transaction (F10), `userId` on every event (erasure); proven by a real-DB smoke. **t-4** — publish-time graph invariants filling the seam `f-map` left in `validatePublishableMap` (prerequisite cycles + unreachable nodes, blocking; live-key-removal warning, non-blocking), standalone/callable for `f-emergence` (F17). Every task through the full `/pr-gates` suite; code-review caught real defects on t-1 (multigraph paths, NUL-separator cycle dedup), t-2 (the two access faces), t-3 (the writer race) — all fixed before merge. Pure framework-tier, no upstream issue, no migration (the tables shipped in f-journey-state). **Unblocks `f-map-editor` (14)** and clears the `f-engine` edge off `f-guidance` (12) + `f-emergence` (18). Lessons: [[planning-retro#B15 · The deterministic engine is where code-review pays for itself — budget for a review-fix commit per task|B15]].
- **2026-07-05 — `f-module-bindings` (07) claimed (Simon) + planned; five spec-vs-repo reconciliations settled.** Detailed plan: [[f-module-bindings]]. The module spine's second half — bind agents/capabilities/workflows/knowledge to a module, never own them (§4.2, A6/A7/A8). Three recon sweeps confirmed the spec's assumed precedents exist (`AiAgent.runtimePromptManaged`, the `AiAgentCapability` pivot with `customConfig`, `ModuleDefinition` explicitly reserving `agentRoles`/`capabilities`, `CapabilityContext.scope`) and surfaced five reconciliations: **(1) API-first — ship the binding _APIs_ here, defer the binding _UI_ to `f-ops-views` (15)**, whose task 1 already owns "bindings management views" (the f-module-core read-API-here / page-there precedent); this is the one reconciliation that reshapes the parent plan's indicative task 1. **(2)** Capability **slug** is namespaced `module-slug.tool` (registry key + audit), but the **LLM function name** can't contain `.` (OpenAI charset) → the name uses a provider-safe transform. **(3)** `scope.moduleSlug` is _populated_ downstream by f-guidance's X5 surface-scoped conversations (the only site that sets `ChatRequest.scope` today is the chat handler); f-module-bindings ships the namespaced registration + a scope-refusal helper (the consuming seam), proven by setting `context.scope` in tests — shape-the-seam-now, like f-map's `validatePublishableMap`. **(4)** `emitHookEvent` is outbound-webhook-**only** and cannot run a workflow (spec imprecision) — `ModuleWorkflowBinding` mirrors `AiWorkflowTrigger` and dispatches via `drainEngine`; the module-lifecycle event _source_ is f-engagement (08), coordinated not depended-on (the 08/09 `JourneyEvent` pattern). **(5)** `runtimePromptManaged` + framework agent _seeds_ are f-facilitation-agents (13) — this feature binds existing agents, seeds none. Sizing: 4 promoted PRs (t-1 agents = anchor/heaviest; t-2 capabilities+scope; t-3 workflows; t-4 knowledge = thin, "no new mechanism", may fold into t-1 per B1). Fourth pure framework-tier feature — no upstream issue; the one core touch is a possible minimal Prisma back-relation on `AiAgent`/`AiWorkflow` (confirm at build). **Unblocks `f-atlas` (16).**
- **2026-07-04 — `f-journey-state` **shipped** (t-1 #27, t-2 #28 merged).** The per-user runtime-state layer over the authored map + the framework's single read-access seam. **t-1** — three models (`UserJourney` / `UserNodeState` / insert-only `JourneyEvent`) on the satellite hand-FK convention, the node-state status vocabulary (free-string, X1), the `framework_add_journey_state` migration (two hand-FK `userId → "user"` cascades + Prisma `journeyId` relations), and the erasure smoke proving journey + node-state + both event kinds gone after `eraseUser()`. **t-2** — `canRead(viewer, subject, scope)` + `subjectScope` in `lib/framework/shared/access.ts` (async from day one, default-deny, open `scope` composing with #367/#366), the `canRead`-guarded journey read queries (`getJourney` / `getNodeStates` / `getJourneyTimeline`, gate-before-Prisma + in-query ownership guard), and the slot-read guarding path documented (shipped `getSlotHeads` untouched). No writer (that is `f-engine`, F11) — a fresh fork boots to empty journey tables. `/code-review` caught the two access faces diverging for admin-support viewers; fixed so `canRead` ⇔ `subjectScope` provably agree (parity test). Fork-first `canRead` contract recorded in [[upstream-asks]] against Sunrise #367/#366 (fork-note to file). **Unblocks `f-engine` (11).** Lesson: [[planning-retro#B14 · A fork-first seam that composes with an upstream issue needs a live ledger, not just plan prose|B14]].
- **2026-07-04 — `f-journey-state` claimed (John) + planned; `JourneyEvent` ownership + key-column + async-`canRead` resolved.** Detailed plan: [[f-journey-state]]. (1) **`JourneyEvent` is created by `f-journey-state` (09), not `f-engagement` (08)** — it is the §5.2 journey-spine model, and 09 is in flight now; 08 **extends its use** (module-lifecycle event types + stats), never its schema (`type` is free-string, X1, so new event kinds aren't migrations). Coordination note added to feature 08; no hard dependency edge. (2) **`JourneyEvent` is `userId`-keyed with a hand-written `ON DELETE CASCADE` FK + an _optional_ `journeyId`, resolving the spec's split sketch** — §4.3 keys it on `userId` (engagement events like `session.started`, module lifecycle — many with no journey), §5.2 keys it on `journeyId`; these are one stream but disagree on the key. The `userId` shape is the only one that holds §4.3's non-journey events _and_ keeps every row erasable: a `journeyId`-only table (or a nullable `journeyId` with no `userId`) leaves non-journey events with no FK path to the user, so they escape erasure — a GDPR hole. Matches §4.3 verbatim and §11's erasure list (which names `UserJourney`/`JourneyEvent`, not `UserNodeState`, as the hand-FK tables); costs one extra hand-FK line (the `SlotValue` pattern). Erasure topology: `UserJourney.userId` + `JourneyEvent.userId` are hand-FK cascades to `"user"`; `UserNodeState.journeyId` (and the optional `JourneyEvent.journeyId`) cascade via Prisma `@relation` to `UserJourney`. (3) **`canRead` / `subjectScope` are `async` from day one** — §8's `JourneyLink` grants need a DB lookup, so shaping the predicate async now avoids a later sync→async sweep of every caller (the churn X2 exists to prevent); `scope` stays an open structured value carrying #367's ownership + #366's tier inputs (#366/#367 verified not landed). (4) Sizing: the board's 3 indicative tasks fold to **2 promoted PRs** (models+erasure · access), per B1 — `canRead` and `subjectScope` are the same seam.
- **2026-07-02 — `f-module-core` planned; three forkability reconciliations vs the rev-16 spec.** Guiding principle: **ship nothing a fork has to delete** — a `git fork` of Daybreak boots clean (empty modules table, one empty leaf hook, zero example rows) while every layer is proven by integration tests against a real DB + real API. (1) **Demo module is tests-only** — a fixture registered through the real `registerModule()` + real `syncRegisteredModules()` in an integration test, not a permanent `demo` row every leaf inherits and strips. (2) **Admin visibility is a read API, not a page** — `GET /api/v1/admin/framework/modules` (API-first; spec §4.4 backend-only); the module list _page_ is `f-ops-views` (feature 15). (3) **Leaf registers modules from the single `initLeafApp()` hook**, not the spec's dedicated `lib/app/modules.ts` + `initAppModules()` scaffold — the forkable shape is _one leaf boot hook, many framework `registerX()` functions_, so the leaf fills exactly one file and `initApp()`'s shape stays frozen (`initFramework()` → `initLeafApp()` → `syncFramework()`) as the framework grows. Also: **first pure framework-tier feature** — everything lives in `lib/framework/modules/`, touches no Sunrise core seam, so it files **no upstream issue** (unlike f-seams/f-bootstrap). Detail: [[f-module-core]].
- **2026-07-02 — Framework boot hook: generic `initApp()` seam, built fork-first to inform upstream.** [[f-bootstrap]]'s last open question resolved. Daybreak's `initFramework()` is invoked at boot via a **generic** seam: Sunrise's `instrumentation.ts` calls `initApp()` from a reserved, empty-by-default `lib/app/bootstrap.ts`; Daybreak's _filled_ copy imports `@/lib/framework` and runs `initFramework()`, delegating to a fresh empty leaf hook. **Core never references `@/lib/framework`** — a static dynamic-import specifier resolves at _build_ time, so Sunrise/ConQuest (no such folder) would fail to build; the reference must be absent from core, living only in the fork-owned filled scaffold (the `lib/app/capabilities.ts` pattern, applied to boot). Built **fork-first as the final generic shape** (not an interim hack) so the eventual upstream PR is a clean extract; file the upstream Sunrise issue as/after `f-bootstrap` t-3, referencing the working impl. Couples t-2↔t-3: the boundary CI whitelists the boot file as the single sanctioned core→framework path.
- **2026-07-02 — Fork-first informs upstream (working model).** When Daybreak needs a generic capability Sunrise lacks, build it **correctly in the fork as its final generic shape**, prove it in situ, and use that to inform an upstream Sunrise PR — never an interim/throwaway. Upstream may refine for its own guardrails; propose from something real, adopt what lands. This is `building-on-sunrise` (fix-in-place → classify → promote upstream) stated as a working preference.
- **2026-07-02 — Framework schema naming: `framework_` tables + clean model names.** [[f-bootstrap]] reconciliation #3 resolved. Framework DDL uses the spec's `framework-*.prisma` files / `framework_` table prefix / `framework_`-named migrations (Appendix B), **not** Sunrise's generic leaf `app_` convention — in the three-tier model `app_` is the _leaf app's_ namespace, so it would tangle Daybreak's DDL with Lelanea's and break the boundary CI that keys on `framework_`. Prisma **model** names stay clean/unprefixed (`model Module { @@map("framework_module") }`) for client ergonomics; accepted low risk of a future Sunrise model-name collision, mitigated by a cheap framework-side rename.
- **2026-07-02 — Three-tier model: Daybreak reserves the leaf surface; its own docs move to `.context/framework/`.** Daybreak is a framework that apps fork (Sunrise → Daybreak → app), so it must apply Sunrise's fork discipline _one tier up_: own `lib/framework/` + **`.context/framework/`**, and keep the leaf surface — `lib/app/*`, `.context/app/`, `prisma/schema/app.prisma` — **empty and reserved** for its own forks (Lelanea et al.), never occupied. Daybreak registers into Sunrise's seams from within `lib/framework/` (via `initFramework()`), as Sunrise registers built-ins from core. Concretely: Daybreak's docs moved out of `.context/app/` into `.context/framework/` (this reverses the earlier f-bootstrap "reconciliation #2"); `.context/app/` is now empty. Full ownership table in [[README|.context/framework/README.md]]. Open follow-up: how `initFramework()` is invoked at boot without occupying a leaf `lib/app/*` file (see [[f-bootstrap]] Open questions; leaning toward a small generic upstream Sunrise boot-init seam).
- **2026-06-30 — Framework named _Daybreak_.** "Daybreak" is the proper name; "expert-led-apps framework" stays the descriptive category. Spec bumped to rev 16; folder `expert-led-apps/` retained as the category folder.
- **2026-06-30 — Three new Sunrise fork-readiness issues triaged (#366/#367/#368).** **#368** (`executeTransaction` tx options) lands upstream _before_ the fork — Daybreak hits the same bulk-write P2028, so it joins `f-seams` at the pre-fork bar. **#366/#367** (authz-scoping seams) do **not** gate the fork — proposal-stage, `lib/auth/`-heavy, and irrelevant to single-user Lelanea; they merge down as inert no-ops when landed. **#367** is wired into `f-journey-state` as a design-time constraint: build `canRead` to compose with the upstream _one-predicate-three-inputs_ resolver, not a private parallel check. See the Relationship-to-Sunrise section.
- **2026-06-24 — Restructured to a flat feature list under one epic.** Phases are _epics_ (coarse, non-gating), not a working layer — per the Hub project page and [[v1-requirements]]. The whole build is one epic, `Framework v1`. The spec's §10 six "phases" are a _build sequence_, re-expressed as feature dependencies, not as structure. Features use semantic slugs; tasks are PRs; commits sit below the model. Resolves the earlier sizing tangle (no phase-buckets to fill).
- **2026-06-23 — Task sizing: PR not commit; feature is the ownership unit.** Carried from the ConQuest overhead lesson; calibrated to the Hub's own ~2–5-tasks-per-feature grain.
- **2026-06-23 — P0 seams land in Sunrise core before forking.** `CapabilityContext.scope` + `buildContext()` contributor registry — verified absent, the framework's only two core touch-points, generic → upstream first (now `f-seams`).
- **2026-06-23 — Framework lives on a separate fork of Sunrise, not core.** See [[placement-decision-memo]] and [[framework-architecture]] rev 16.
- **2026-06-23 — Assume the nine open Sunrise issues are cleared before forking.** Four leveraged (#307/#304/#303/#305); rest are CI/ops hygiene. React Flow assumption in the spec corrected (Sunrise's builder is custom).

---

## Work completed to date

Append-only. Newest at the top.

- **2026-07-04 — `f-slots` **shipped** (t-1 #19, t-2 #22, t-3 #24 all merged).** The Data-Slots
  layer — the third pure framework-tier feature (no Sunrise touch-point, no upstream issue). **t-1**
  (#19) — `SlotDefinition` model (`framework_slot_definition`, free-string vocabulary per X1) +
  module-declared registration (`slotDefinitions` on `ModuleDefinition`, scope-stamped `module:<slug>`)
  - the boot sync, which the build **refined from f-module-core's seed-once shape to a full reconcile**
    (a slot-definition row is a pure code projection with no operator columns, so authored edits must
    propagate); `/code-review` then caught two boot-reconcile defects — an unscoped deactivate that would
    silently retire a future global/facilitation slot, and a no-op guard keyed on the collected slot set
    rather than registered modules (both fixed in-PR, folded to [[planning-retro#B10]]). **t-2** (#22) —
    the insert-only `SlotValue` model (`supersededAt` head-read denormalisation, D4) + the pure value
    engine (`appendSlotValue` / `getSlotHeads`) + the hand-written `userId → "user"` FK cascade, whose
    first draft referenced the model name `"User"` and failed at apply — the core `User` model `@@map`s to
    lowercase `"user"` (folded to [[planning-retro#B11]]) — proven by a real-DB erasure smoke assertion.
    **t-3** (#24) — `GET /api/v1/admin/framework/slot-definitions` (`withAdminAuth`; second route under the
    framework admin-API namespace) + contract test. Every PR ran the full gate loop. A fresh fork boots to
    **empty** slot tables (Daybreak declares zero slots; leaf apps declare their own). Detail: [[f-slots]].
    `f-slots` is **shipped**, unblocking **`f-slot-capture`** (10).
- **2026-07-04 — `f-map` **shipped** (t-1 #16, t-2 #20, t-3 #21 all merged).** The authored facilitation
  map, second pure framework-tier feature (no Sunrise touch-point, no upstream issue). **t-1** (#16) — the
  pure Zod **format** (nodes / four edge types / three family-tagged condition families / region containers,
  F3–F5) + `validateMapFormat` (within-snapshot referential integrity); code-review caught `z.string().datetime()`
  being UTC-`Z`-only (fixed to `{ offset: true }`). **t-2** (#20) — `FacilitationGraph` + immutable
  `FacilitationGraphVersion` models (mirror `AiWorkflowVersion`; `createdBy` a bare `String`, no `User` FK) +
  the version service (create/draft/publish/rollback/read, slug-identified), publish gated by the composable
  `validatePublishableMap` chain **f-engine extends** with graph-invariant checks. **t-3** (#21) — the admin API
  under `/api/v1/admin/framework/maps/**` (all `withAdminAuth`, Zod bodies) + `api-schemas.ts` / `queries.ts`.
  Every PR ran the full gate loop; the `prisma migrate dev` DROP-INDEX footgun recurred and was stripped again.
  A fresh fork boots with **zero maps** (data-authored, not code-first). Detail: [[f-map]]. `f-map` is **shipped**,
  unblocking **`f-journey-state`** (09).
- **2026-07-03 — `f-module-core` **shipped** (t-1 #10, t-2 #11, t-3 #12 all merged).** The
  code-first module spine, entirely framework-tier (no Sunrise touch-point, no upstream issue). **t-1**
  (#10) — `ModuleDefinition` + `registerModule()` + registry + `framework_module` model + boot-time
  **set-based** `syncFramework()` (code-review rebuilt it from the planned per-slug upsert: that churned
  `updatedAt` every boot and `notIn:[]` mass-unregistered on an empty registry — now createMany +
  `isRegistered`-guarded updateManys + empty-registry no-op). **t-2** (#11) — pure
  `isModuleLive(module, flags, now, entitlement?)` (A5) returning a discriminated union, with the C1
  entitlement seam reserved; `MODULE_STATUS` vocabulary. **t-3** (#12) — `GET
/api/v1/admin/framework/modules` (`withAdminAuth`; first `app/api/v1/admin/framework/` route — first
  file to exercise that tier's ESLint glob) + `listModules()` + an end-to-end register→sync→read
  visibility test (stateful in-memory Prisma fake). Every PR ran the full gate loop (`/pre-pr` →
  `/security-review` → `/code-review`); code-review caught real defects on #10 and #12. Sizing: the
  spec's 4 indicative tasks folded to 3 promoted PRs ([[planning-retro#B1]]). A fresh fork still boots to
  an empty modules table. Detail: [[f-module-core]]. `f-module-core` is **shipped**, unblocking
  `f-module-config` / `f-module-bindings` / `f-engagement`.
- **2026-07-03 — `f-bootstrap` shipped (t-2 #8, t-3 #9).** The enforced boundary (X6) and the boot seam.
  **t-2** (#8) — framework↔Sunrise boundary via **fork-first** ESLint/CI seams (fork-owned
  `lib/framework/eslint.config.mjs` + reserved leaf seam + a one-line root spread + an `--if-present` CI
  hook), not direct edits to platform-owned config; `scripts/boundary/` proves it bites. **t-3** (#9) —
  `initFramework()` + the generic `initApp()` **core→fork boot seam** (`instrumentation.ts` → reserved
  `lib/app/bootstrap.ts` → `@/lib/framework`, dynamic-import so a framework-less fork still builds),
  with failure-isolation added in code-review. Both seams built fork-first as their final generic shape;
  upstream Sunrise issues **#382** (ESLint/CI seams) and **#385** (boot seam + `/framework` reservation)
  filed with the fork-build learnings for the Sunrise agent to implement. `f-bootstrap` is **shipped**;
  execution lessons captured in [[planning-retro]] §B (B5–B9).
- **2026-07-02 — `f-bootstrap` started; t-1 (framework skeleton) merged.** `lib/framework/{modules,facilitation,data-slots,shared}/` stood up, with `shared/scope.ts` (the one scoping vocabulary) as the only real logic; three empty `framework-*.prisma` files; a scope test. Merged via **PR #6** (all gates green: pre-pr + code-review clean). Sizing note: t-1 landed commit-sized rather than PR-sized — captured as process feedback in [[planning-retro]].
- **2026-07-02 — `f-seams` shipped, and Sunrise v0.5.0 merged into the fork.** The two generic core seams were filed as Sunrise **#372**, implemented upstream in **PR #373** (`CapabilityContext.scope?: Record<string,string>` + the `registerContextContributor()` registry on `buildContext()` + the empty fork-owned `lib/app/context-contributors.ts` scaffold), and released in **Sunrise v0.5.0**. Merged into this Daybreak fork via **PR #4** — `SUNRISE_VERSION → 0.5.0` while Daybreak's app version stays `0.1.0`; three trivial conflicts (`package.json`, `package-lock.json`, `CLAUDE.md`) resolved keeping the fork's identity + banner; no new migrations. Type-check / lint / format green, 64 seam tests pass. `f-seams` is **shipped**; `f-bootstrap` is unblocked and next.
  - _Note on ownership:_ scoped in the plan as "2 PRs, owner Simon (Sunrise)"; delivered as us filing the Sunrise issue and upstream implementing it as a single PR — the seams are generic, so they belong to Sunrise, exactly as intended.

---

## References

- [[planning-retro]] — feedback about the **plan-authoring process itself**, discovered while executing this plan, split by target: **§A overall-plan authoring** (the priority — it feeds the HCE Hub's plan-authoring process) and **§B feature-plan authoring**. To fold back into the agent instructions that generate plans like this one.
- [[framework-architecture]] — the authoritative design spec (rev 16). Binding decisions in Appendix A.
- [[placement-decision-memo]] — why the framework lives on a separate fork.
- [[v1-requirements|HCE Hub v1 requirements]] — the Project → Phase(epic) → Feature → Task model this plan mirrors.
- [[plan|ConQuest plan]] — the sibling plan; this one carries its task-sizing lesson.
- [[building-on-sunrise]] — how a fork relates to Sunrise upstream (applied one level up).

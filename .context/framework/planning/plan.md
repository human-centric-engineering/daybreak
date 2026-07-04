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

| Field                   | Value                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                    | **Daybreak** (the expert-led-apps framework)                                                                                                                                                                                              |
| Active epic             | **Framework v1** (the whole build below)                                                                                                                                                                                                  |
| Spec                    | [[framework-architecture]] rev 16 (Binding decisions in Appendix A)                                                                                                                                                                       |
| Repo                    | `human-centric-engineering/daybreak` — fork of `human-centric-engineering/sunrise` (tracking `upstream`, at Sunrise v0.5.0)                                                                                                               |
| Placement               | Separate fork of Sunrise, **not** core ([[placement-decision-memo                                                                                                                                                                         | decision 2026-06-23]]) |
| Relationship to Sunrise | [[building-on-sunrise]], one level up: fix-in-place → classify → promote generic upstream; Hub-coordinated                                                                                                                                |
| First app               | Lelanea (transcendental coaching) — forks this framework repo                                                                                                                                                                             |
| Lead                    | Simon Holmes                                                                                                                                                                                                                              |
| Status                  | `in flight` — `f-seams` + `f-bootstrap` + `f-module-core` + `f-map` + `f-slots` + `f-journey-state` **shipped**; **5 features available to claim** (`f-module-config`, `f-module-bindings`, `f-engagement`, `f-slot-capture`, `f-engine`) |

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

| #   | Feature                 | Owner           | Status                                                      | Depends on                                        | ~PRs | Capability                                       |
| --- | ----------------------- | --------------- | ----------------------------------------------------------- | ------------------------------------------------- | ---- | ------------------------------------------------ |
| 01  | `f-seams`               | Simon (Sunrise) | **shipped** (v0.5.0)                                        | —                                                 | 2    | Two generic Sunrise core seams (pre-fork)        |
| 02  | `f-bootstrap`           | Simon Holmes    | **shipped** (#4/#6/#8/#9)                                   | f-seams                                           | 4    | Fork + framework skeleton + enforced boundary    |
| 03  | `f-module-core`         | Simon Holmes    | **shipped** (#10 / #11 / #12)                               | f-bootstrap                                       | 3    | Module definition, registry, seam, liveness      |
| 04  | `f-map`                 | Simon Holmes    | **shipped** (#16 / #20 / #21)                               | f-bootstrap ✅                                    | 4    | Facilitation map: schema, versioning, format     |
| 05  | `f-slots`               | John            | **shipped** (#19 / #22 / #24)                               | f-bootstrap ✅                                    | 3    | Slot definitions + insert-only values            |
| 06  | `f-module-config`       | _unclaimed_     | **available** ▲                                             | f-module-core ✅                                  | 4    | Generic Zod config form + config versioning      |
| 07  | `f-module-bindings`     | _unclaimed_     | **available** ▲                                             | f-module-core ✅                                  | 4    | Agent / workflow / knowledge bindings            |
| 08  | `f-engagement`          | _unclaimed_     | **available** ▲                                             | f-module-core ✅                                  | 3    | Engagement event stream + stats + feedback       |
| 09  | `f-journey-state`       | John            | **shipped** (#27 / #28)                                     | f-map ✅                                          | 3    | Journey state models + access discipline         |
| 10  | `f-slot-capture`        | _unclaimed_     | **available** ▲                                             | f-slots ✅                                        | 3    | `fill_slot` / `get_state` capture capabilities   |
| 11  | `f-engine`              | _unclaimed_     | **available** ▲                                             | f-map ✅, f-journey-state ✅                      | 5    | Deterministic engine + GraphStore                |
| 12  | `f-guidance`            | _unclaimed_     | blocked → f-engine, f-slot-capture                          | f-engine, f-slot-capture                          | 5    | Guidance service, capabilities, chat injection   |
| 13  | `f-facilitation-agents` | _unclaimed_     | blocked → f-guidance                                        | f-guidance                                        | 3    | Facilitation agent family + surface-scoping      |
| 14  | `f-map-editor`          | _unclaimed_     | blocked → f-map, f-engine                                   | f-map, f-engine                                   | 5    | Map editor + journey dry-run simulator           |
| 15  | `f-ops-views`           | _unclaimed_     | blocked → f-module-config                                   | f-module-config, f-journey-state ✅               | 4    | Module admin + journey explorer                  |
| 16  | `f-atlas`               | _unclaimed_     | blocked → f-module-bindings, f-facilitation-agents, f-slots | f-module-bindings, f-facilitation-agents, f-slots | 3    | Framework atlas (composition view)               |
| 17  | `f-policies`            | _unclaimed_     | blocked → f-facilitation-agents                             | f-facilitation-agents                             | 4    | Typed facilitation policy kinds                  |
| 18  | `f-emergence`           | _unclaimed_     | blocked → f-engine, f-facilitation-agents                   | f-engine, f-facilitation-agents                   | 4    | Structure-change proposal pipeline + eval wiring |
| 19  | `f-overlays`            | _unclaimed_     | blocked → f-guidance                                        | f-guidance                                        | 3    | pgvector similarity + proactive guidance         |

**Critical path:** `f-seams → f-bootstrap → f-module-core/f-map → f-journey-state → f-engine → f-guidance → f-facilitation-agents`. Admin (14–16) and governance (17–19) hang off that spine and parallelise once it exists.

### Board — status & claiming

**Legend.** `shipped` — merged to `main`. `in flight` — an owner is actively building it (its promoted tasks live in the feature's detailed plan). `available` ▲ — every dependency is shipped and no one owns it: **free to claim now**. `blocked → X` — waiting on feature X to ship.

**Claimable right now (▲) — five open features.** **`f-journey-state` (09)** is **shipped** (#27 / #28), which unblocks **`f-engine` (11)** — the deterministic engine now at the head of the remaining critical path (it feeds `f-guidance` → `f-facilitation-agents`). `f-slots` (05) is **shipped**, which unblocks **`f-slot-capture` (10)** — the `fill_slot` / `get_state` capabilities over the insert-only value engine `f-slots` landed. The rest of the unclaimed set — **`f-module-config` (06)**, **`f-module-bindings` (07)**, **`f-engagement` (08)** — extends the module layer and runs in parallel.

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

_Owner:_ TBD · _Depends on:_ f-module-core · _~4 PRs_

Generic admin config from each module's Zod schema (A4) + config versioning (A10).

- **t** — Generic config form rendered from a module's `configSchema` (reuse Sunrise form-builder + `<FieldHelp>`); API validation with the same schema; JSON storage.
- **t** — `ModuleVersion` snapshot table + version chain (draft/publish/rollback), `createdBy`.
- **t** — Admin version-history tab + rollback control; audit-log every config mutation.

### 07 · `f-module-bindings` — agent / workflow / knowledge bindings

_Owner:_ TBD · _Depends on:_ f-module-core · _~4 PRs_

Attach by binding, not ownership (A6); one generic binding UI for every module.

- **t** — `ModuleAgentBinding` pivot (role/seat, `isPrimary`, `config`) + generic seat-binding admin UI; runtime-prompt agents set `runtimePromptManaged` (#304).
- **t** — Module-declared capabilities into the global registry namespaced `module-slug.tool` (A8); dispatcher populates `scope.moduleSlug` via the `f-seams` map so a capability can refuse out-of-scope.
- **t** — `ModuleWorkflowBinding` (event → workflow) over the existing trigger machinery.
- **t** — Knowledge grants: bound agents get doc/tag access via the existing restricted-access system.

### 08 · `f-engagement` — event stream + stats + feedback

_Owner:_ TBD · _Depends on:_ f-module-core · _~3 PRs_

Stats from an insert-only stream, never counters (A9). Shares `JourneyEvent` with the journey log (§4.3 = §5.4).

> **Coordination — `JourneyEvent` is created by [[#09 · `f-journey-state` — journey state + access discipline|f-journey-state (09)]], not here.** The shared stream ships with the journey-state models (09 is in flight now). It is **`userId`-keyed with a hand-FK cascade + optional `journeyId`** — the shape that holds both journey-traversal events (which set `journeyId`) and this feature's non-journey engagement events (`session.started`, module lifecycle — `journeyId` null) while keeping every row erasable (the §4.3-vs-§5.2 key-column reconciliation; see the decisions log). `f-engagement` **extends its _use_, not its schema**: module-lifecycle event types (`type` is a free-form `String`, X1 — new kinds are not migrations) + stats aggregation over the stream. So this feature's t-1 below becomes "dispatch module-lifecycle events into the existing `JourneyEvent` table + the stats read side", not "create the table". No hard dependency edge (small additive create; whichever of 08/09 ships first would own it, and 09 is in flight).

- **t** — Module lifecycle events dispatched via the event-hook system into `JourneyEvent` (created by `f-journey-state`); `journeyId` left null for non-journey engagement.
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

_Owner:_ _unclaimed_ · _Status:_ **available to claim** ▲ (dep `f-slots` shipped) · _Depends on:_ f-slots · _~3 PRs_

Silent capture riding the existing tool loop (D5); leverages #307.

- **t** — `get_state()` + `fill_slot(...)` as `BaseCapability`s; validate against definition or mint open-mode slug; write next version; silent in conversation; `processesPii=true` + `redactProvenance`.
- **t** — Sensitivity-driven masking-before-storage (`special_category` strictest); `fill_slot` extraction forwards the slot's Zod schema as enforced structured output (#307).
- **t** — Selective per-agent exposure via grant `customConfig` (which groups/scopes an agent may read/write), enforced inside the capability.

### 11 · `f-engine` — deterministic engine + GraphStore

_Owner:_ _unclaimed_ · _Status:_ **available to claim** ▲ (deps `f-map` + `f-journey-state` shipped) · _Depends on:_ f-map, f-journey-state · _~5 PRs_

The deterministic spine (spec §5.3), pure and LLM-free; sole writer of state (F11). One coherent capability.

- **t** — `GraphStore` interface + Postgres recursive-CTE impl (reachability, neighbours, paths) + tests (F8).
- **t** — Availability computation: typed-edge + state- + slot-predicate evaluation, with explainable lock reasons.
- **t** — Temporal predicates + timezone-resolved `now` per journey (C7).
- **t** — Transition validation (`applyEvent`): once/repeatable semantics, single-transaction event + projection write, structured rejections.
- **t** — Publish-time invariant validation: cycles, unreachable-required, live-state key-removal warnings (shared with `f-emergence`).

### 12 · `f-guidance` — guidance service, capabilities & chat injection

_Owner:_ TBD · _Depends on:_ f-engine, f-slot-capture · _~5 PRs_

Engine computes what's possible; guidance ranks what's wise; agents narrate (F12). First moment it's _felt_ in conversation.

- **t** — `guidance.ts` ranking already-eligible options using recency-weighted slot reads; reasons in payload.
- **t** — Capability family: `get_journey_state`, `get_next_steps`, `get_progress_synopsis`, `suggest_focus`, `request_transition` — built-in `BaseCapability`s, granted per agent.
- **t** — Register the framework context contributor via the `f-seams` registry; inject module scope + journey position + fresh slots per turn.
- **t** — Surface-scoped conversations (X5): each module/facilitation surface its own `AiConversation` with its bound agent; continuity carried by state, not threads.
- **t** — Boundary test: a strip of the framework leaves `buildContext()` with one fewer contributor (proves the seam stayed clean).

### 13 · `f-facilitation-agents` — facilitation agent family

_Owner:_ TBD · _Depends on:_ f-guidance · _~3 PRs_

Same binding pattern as modules, second scope (one mechanism, two scopes).

- **t** — `FacilitationAgentBinding` (agentId, role); bind the family (onboarding, orientation, synopsis, state, path/progress, facilitator persona) granted the guidance capabilities.
- **t** — Agent seeds via the `isSystem:false` scaffold (#303); `runtimePromptManaged` set (#304).
- **t** — Per-scope guard settings (sensitive scopes get stricter inline guards — sets up `f-policies`).

### 14 · `f-map-editor` — map editor + dry-run simulator

_Owner:_ TBD · _Depends on:_ f-map, f-engine · _~5 PRs_

Authoring tools on the engine (spec §5.6). **Note:** Sunrise's workflow builder is a _custom_ canvas, **not** React Flow (verified June 2026) — confirm its primitives first.

- **t** — Confirm Sunrise's builder primitives (canvas, palette, edges, config panel) + the reuse seam.
- **t** — Facilitation node/edge palette + typed-edge drawing; region collapse/expand.
- **t** — Per-node config panel (gating conditions, first-arrival, module binding); pre-publish validation surfacing (from `f-engine`).
- **t** — Version-history / publish / rollback controls.
- **t** — Journey dry-run simulator: synthetic user (completions, slots, clock) vs a _draft_ map — available/locked/why, guidance ranking, temporal-gate + policy preview (F18).

### 15 · `f-ops-views` — module admin + journey explorer

_Owner:_ TBD · _Status:_ **blocked** → f-module-config (`f-journey-state` shipped ✅) · _Depends on:_ f-module-config, f-journey-state · _~4 PRs_

The operational read surfaces.

- **t** — Module list + detail page; stats from the event stream; bindings management views.
- **t** — Journey explorer: read-only canvas with overlays (collective heat, drop-off edges) from the event stream.
- **t** — Individual-journey replay along the map from the event log; subject-scope-ready queries.

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

_Owner:_ TBD · _Depends on:_ f-engine, f-facilitation-agents · _~4 PRs_

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

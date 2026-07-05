---
name: f-module-bindings
feature: 07 · f-module-bindings
epic: Framework v1
status: in flight
owner: Simon Holmes
depends_on: f-module-core (shipped — #10 / #11 / #12)
spec: framework-architecture.md §4.2 (bindings, not ownership), Appendix A (A6 role bindings · A7 two parallel tables · A8 namespaced capabilities + generic scope), X1 / X6
parent: plan.md
opened: 2026-07-05
---

# f-module-bindings — agent / workflow / knowledge bindings

> Feature-level build plan for **`f-module-bindings`**, the layer that makes a
> registered module _functional_: agents, capabilities, workflows, and knowledge
> attach to a module by **binding**, never by ownership. Parent:
> [[plan#07 · `f-module-bindings` — agent / workflow / knowledge bindings|plan.md]].
> Binding _how_: [[framework-architecture#4.2 Agents, capabilities, workflows — bindings, not ownership|§4.2]]
> and Appendix A (A6 agents bind with roles · A7 two parallel binding tables ·
> A8 capabilities in the one registry, namespaced, scoped via the generic
> `CapabilityContext.scope` map). Sizing follows the parent plan: **task = one PR**
> (~200–600 lines, cohesive, reviewable).
>
> Read [[building-a-feature]] first if you're picking this up — it's the execution
> rhythm this plan assumes.

## Intent

`f-module-core` gave a module a code definition, a DB row, liveness, and a read API —
but a module today owns nothing that _does_ anything. This feature attaches the four
things that make a module a working feature-unit, every one by the **binding**
principle (§4.2, A6): the module never _owns_ an agent/capability/workflow/document; it
_binds_ to ordinary platform entities with a role or scope. A universal agent is one
bound into many modules; a module-specific agent is bound into one. Nothing on `AiAgent`
changes; agent admin stays where it is.

Four attachments ship here:

1. **Agent bindings** — a `ModuleAgentBinding` pivot binds an `AiAgent` into a module in
   a **named seat** (`role`, from the module's declared `agentRoles`), with `isPrimary`
   (the chat-companion seat) and per-binding `config` overrides. (A6, A7.)
2. **Capabilities** — a module declares capabilities; the framework registers them into
   the **one global capability registry**, namespaced `module-slug.tool` so two modules
   never collide on a generic name, then they are granted to bound agents the ordinary
   way. A capability learns _which module scope it is executing in_ through the generic
   `CapabilityContext.scope` map (the `f-seams` seam) and can refuse out-of-scope. (A8.)
3. **Workflow bindings** — a thin `ModuleWorkflowBinding` (moduleId, eventType,
   workflowId, enabled) lets an admin say "when X happens in this module, run workflow
   Y", reusing the existing workflow execution machinery. (§4.2.)
4. **Knowledge grants** — bound agents get document/tag access through the **existing**
   restricted-access system ("no new mechanism at all", §4.2): a module's agents see the
   module's corner of the expert's material.

This is the second half of the **module spine** (f-module-core was the first). It has no
facilitation dependency and runs in parallel with John's facilitation spine; it
**unblocks `f-atlas` (16)**, which projects these bindings.

**What ships here, and what deliberately does not.** In scope: the two binding models
(`ModuleAgentBinding`, `ModuleWorkflowBinding`) + migration, the `ModuleDefinition`
extensions (`agentRoles`, `capabilities`) + boot registration of module capabilities, the
capability **scope-refusal** helper, and the **admin binding APIs** over all of it. **Out
of scope** (owned by the features that consume them, so no dead surface lands early):

- **The binding admin _pages / UI_** — the seat-binding forms, the bindings-management
  views — are **`f-ops-views`** (feature 15), whose task 1 is explicitly _"Module list +
  detail page … bindings management views."_ f-module-bindings ships the **APIs** the
  views drive, exactly as **f-module-core shipped a read API and deferred its page to
  f-ops-views** (its decision log, 2026-07-02). This is the API-first rule (CLAUDE.md) and
  the "ship nothing a fork must delete" principle — see reconciliation #1.
- **Populating `scope.moduleSlug` on a live conversation** — the runtime that opens a
  module-scoped chat surface and sets `ChatRequest.scope` is **`f-guidance`** (feature 12,
  X5 surface-scoped conversations). f-module-bindings ships the **registration + the
  read-and-refuse helper** (the consuming side); the population is the seam f-guidance
  wires — see reconciliation #3.
- **The module-lifecycle _event source_** (something that fires `module.entered` /
  `module.completed`) — the dispatch of module-lifecycle events into the `JourneyEvent`
  stream is **`f-engagement`** (feature 08). f-module-bindings ships the
  `ModuleWorkflowBinding` table + the **resolve-bindings → run-workflow dispatch
  function**, proven by calling it directly; wiring a real event to call it is
  coordinated with f-engagement — see reconciliation #4.
- **Framework agent _seeds_** (the facilitation agent family, which set
  `runtimePromptManaged`) are **`f-facilitation-agents`** (feature 13). f-module-bindings
  binds _existing_ agents into seats; it seeds none — see reconciliation #5.
- **The `FacilitationAgentBinding`** (agents bound to a facilitation scope) is the
  **second** of A7's two parallel tables and belongs to **`f-facilitation-agents`** (13).
  f-module-bindings builds only the **module** binding tables. A7 is honoured by _not_
  building a polymorphic `FrameworkAgentBinding`.

## The fourth pure framework-tier feature — no upstream issue

Like `f-module-core` / `f-map` / `f-slots`, **`f-module-bindings` touches no Sunrise core
seam.** Every piece — the binding models, the registration, the scope helper, the admin
routes — lives in the **framework tier** (`lib/framework/modules/`,
`app/api/v1/admin/framework/modules/…`) and only _consumes_ core through the allowed
framework→core direction (the capability dispatcher, `resolveAgentDocumentAccess`,
`drainEngine`, `logAdminAction`, `@/lib/api/errors`). The one core seam it _reads_ —
`CapabilityContext.scope` — already landed generically in Sunrise v0.5.0 (`f-seams` /
#372); this feature only writes/reads the framework-side keys through
`lib/framework/shared/scope.ts`, adding **zero framework vocabulary to core** (X6). So
**this feature files no upstream issue** and carries no cross-repo follow-up.

## Reconciliation with current repo reality

Per [[planning-retro#B2]], every feature plan reconciles the (rev-16) spec against the
actual tree. Three focused recon sweeps (2026-07-05) confirmed the spec's assumed
precedents and surfaced five reconciliations — recorded here so they're settled in review,
not re-litigated at build time.

**What the spec assumed, and it's true:**

- **`runtimePromptManaged` exists** — `AiAgent.runtimePromptManaged Boolean @default(false)`
  (`prisma/schema/orchestration-agents.prisma:63`, migration `20260625080639_…`), plus
  `runtimePromptNote String?`. Behaviour-neutral honesty flag (#304); the runtime never
  reads it, it drives an admin callout only.
- **The `AiAgentCapability` pivot with `customConfig` exists** — `AiAgentCapability`
  (`orchestration-agents.prisma:270`): `agentId`, `capabilityId`, `isEnabled`,
  **`customConfig Json?`**, `customRateLimit Int?`, `@@unique([agentId, capabilityId])`,
  both relations `onDelete: Cascade`. This is the shape `ModuleAgentBinding` mirrors, and
  `customConfig` is the precedent for a "grant carries per-binding config" pattern.
- **`ModuleDefinition` reserves exactly what we add** — `lib/framework/modules/definition.ts`
  today declares `slug`/`name`/`description`/`configSchema`/`slotDefinitions?` and its
  header comment explicitly reserves `capabilities` / `agentRoles` for
  _"f-module-bindings (A6/A8)"_ and `events` for f-engagement. `Module`
  (`framework-modules.prisma:26`) has **no relations yet** and its header notes the binding
  pivots are intentionally absent "so no unused columns land early." So this feature is
  precisely the reserved slot — nothing to retrofit, just fill.
- **`CapabilityContext.scope?: Record<string,string>` exists** (`lib/orchestration/capabilities/types.ts:52`),
  a pure pass-through; the dispatcher threads it into `execute()` untouched and reads no
  keys — exactly the generic seam A8 requires.

**Five reconciliations (spec vs tree):**

1. **API-first: ship the binding _APIs_ here; the binding _UI_ is `f-ops-views` (15).**
   The parent plan's indicative task 1 says "generic seat-binding admin UI", but
   f-ops-views task 1 already owns _"bindings management views"_, and f-module-core set the
   precedent (read API here, page → f-ops-views). So f-module-bindings ships the
   **admin binding APIs** (create/list/delete a binding; toggle) + audit; the **forms and
   management views land in f-ops-views**. Keeps API-first (CLAUDE.md) and "ship nothing a
   fork must delete". _This is the one reconciliation that visibly reshapes the parent
   plan's task 1 — flagged for confirmation._

2. **Capability _slug_ is namespaced `module-slug.tool`; the LLM-facing function _name_
   is not.** A8 namespaces the **slug** (`module-slug.tool`) — and the registry is a flat
   `Map<string, …>` keyed by slug, so a dotted slug works as a key with no core change
   (`dispatcher.ts:109`). **But** `functionDefinition.name` is passed straight to the
   provider, and OpenAI's tool-name charset **disallows `.`** (`estimate-cost.ts` keeps
   slug === function name; we can't here). So: the **slug** carries the namespace (registry
   uniqueness + audit, A8's collision-prevention intent); the **function name** the LLM
   sees uses a provider-safe form (e.g. the module prefix with `.`/`-`→`_`, or the bare
   tool name). Settle the exact transform at t-2 build; note it now so it isn't discovered
   at the provider boundary.

3. **`scope.moduleSlug` is _populated_ downstream (f-guidance X5); f-module-bindings ships
   the _consuming_ seam.** Recon found `scope` is populated at exactly **one** site today —
   the chat streaming handler, from `ChatRequest.scope` (`streaming-handler.ts:1609`); the
   three non-chat dispatch sites omit it, and no core code writes `scope.moduleSlug`. The
   code that _opens a module-scoped conversation and sets `ChatRequest.scope`_ is the
   surface-scoped-conversation machinery, which is **f-guidance** (X5). So here we ship
   the **namespaced registration + a `assertInModuleScope(context)` / scope-read helper**
   (built on `decodeScope` from `lib/framework/shared/scope.ts`) that a module capability
   calls to refuse out-of-scope, and **prove it by setting `context.scope` directly in
   tests**. The live population is f-guidance's wiring — the same "shape the seam now, wire
   it later" discipline as f-map's `validatePublishableMap` and `f-journey-state`'s
   `canRead`. _Interim window:_ until f-guidance, a module capability granted to an agent
   is reachable without a populated `moduleSlug`; the helper's default posture (below) makes
   that safe, not a hole.

4. **`emitHookEvent` is outbound-webhook-only — it cannot run a workflow (spec
   imprecision).** §4.2 says lifecycle events are "dispatched through the existing
   event-hook system" and a `ModuleWorkflowBinding` runs workflow Y. Recon: the hook system
   (`lib/orchestration/hooks/`) only fans out to **HTTP webhooks** — no action type starts a
   workflow. The real "run a workflow by id" entry is **`drainEngine(executionId, workflow,
definition, inputData, userId, versionId)`** (`scheduling/scheduler.ts:102`) over
   `OrchestrationEngine.execute()`, and the existing "row → workflow" trigger precedents are
   **`AiWorkflowTrigger`** (`@@unique([channel, workflowId])`) and `AiWorkflowSchedule`
   (`inputTemplate Json`). So `ModuleWorkflowBinding` **mirrors `AiWorkflowTrigger`** and its
   dispatch function follows the standard pattern (create a `PENDING`/`RUNNING`
   `AiWorkflowExecution` pinning `publishedVersion.id`, then `void drainEngine(...)`). The
   **event _source_** (what fires `module.entered`) is **f-engagement** (08); we ship the
   binding + dispatch function callable/testable in isolation, with a coordination note (no
   hard dependency edge — mirrors the `JourneyEvent` coordination between 08/09).

5. **`runtimePromptManaged` and framework agent _seeds_ are `f-facilitation-agents` (13);
   nothing to build here beyond honouring the flag.** The parent plan's task 1 says
   "runtime-prompt agents set `runtimePromptManaged` (#304)". The flag exists; but
   f-module-bindings **binds existing agents into seats, it seeds none** — the facilitation
   agent family (which are the runtime-prompt-managed companion agents) is seeded in
   feature 13 via the `isSystem:false` scaffold (#303). So the only obligation here is to
   **not** override or fight the flag, and to document that a companion agent bound into a
   primary seat is expected to carry it. No seed work in this feature.

**Also settled (no decision needed):**

- **A7 — two parallel tables, honoured by omission.** Build `ModuleAgentBinding` /
  `ModuleWorkflowBinding` (module scope); the `FacilitationAgentBinding` (the second table)
  is f-facilitation-agents. Do **not** build a polymorphic `FrameworkAgentBinding`.
- **X1 — free-form `String` for `role` / `eventType`.** No Prisma enums; role validity is
  checked against the module's declared `agentRoles` at **bind time in the API** (a Zod +
  registry lookup), not a DB enum — a new role is a code change to the `ModuleDefinition`,
  never a migration.
- **CHANGELOG:** no Sunrise public surface touched → **no `CHANGELOG.md` entry**
  (consistent with f-module-core / f-map / f-slots; `/pre-pr` 5d keys on Sunrise
  public-surface paths, none of which this feature touches).
- **Test strategy up front ([[planning-retro#B9]]):** vitest is `happy-dom`, **no live DB**.
  The scope helper (t-2) is **pure** → exhaustive unit tests. Binding services + APIs: mock
  `@/lib/db/client`, forward `$transaction` to a `tx` mock, assert exact create/delete calls
  - audit; the workflow-dispatch function (t-3) mocks `drainEngine` and asserts it's called
    with the resolved bindings; the knowledge-grant apply (t-4) mocks the grant pivots +
    `invalidateAgentAccess`. Contract tests for routes mock the service via `vi.hoisted` so
    they never `import @/lib/framework` (X6 boundary, the f-map t-3 convention).

### Concrete reuse anchors found in-tree

- **`AiAgentCapability`** (`orchestration-agents.prisma:270`) — the pivot shape
  `ModuleAgentBinding` mirrors (`@@unique`, `onDelete: Cascade` both sides, `Json?`
  per-binding config).
- **`capabilityDispatcher.register(new X())`** (`capabilities/dispatcher.ts:101`) — the
  in-memory handler registration (sync, no DB); `BaseCapability`
  (`capabilities/base-capability.ts:53`) is the class module capabilities extend. Note the
  **two-layer** registry: in-memory handler (register in `initFramework()`, sync) **and**
  the `AiCapability` DB metadata row a grant references (upsert in `syncFramework()`, async)
  — module-capability registration spans both, like the built-ins.
- **`lib/framework/shared/scope.ts`** — `decodeScope(context.scope)` / `SCOPE_KEYS.moduleSlug`
  / `FrameworkScope` already exist (from f-bootstrap); the t-2 refuse-helper is built on
  `decodeScope`, adding no new scope vocabulary.
- **`resolveAgentDocumentAccess(agentId)`** (`knowledge/resolveAgentDocumentAccess.ts:62`) +
  the `AiAgentKnowledgeDocument` / `AiAgentKnowledgeTag` grant pivots + `AiAgent.knowledgeAccessMode`
  - `invalidateAgentAccess(agentId)` — the **entire** knowledge mechanism already exists;
    t-4 grants module docs/tags to bound agents through it and invalidates the cache (§4.2
    "no new mechanism at all").
- **`drainEngine(...)`** (`scheduling/scheduler.ts:102`) + `AiWorkflowTrigger`
  (`orchestration-workflows.prisma:104`) — the workflow-run entry and the trigger-row
  precedent t-3 reuses.
- **`syncRegisteredModules()` / `syncRegisteredSlotDefinitions()`** (`modules/sync.ts`,
  `data-slots/sync.ts`) — the boot-reconcile pattern (set-based, empty-registry no-op, B10)
  a `syncRegisteredModuleCapabilities()` DB-metadata pass mirrors.
- **`logAdminAction`** (`@/lib/orchestration/audit/admin-audit-logger`) + `@/lib/api/errors`
  - the `withAdminAuth` framework route pattern (f-map t-3) — the admin-API scaffolding, all
    framework→core (allowed).

## Tasks (promoted)

| ID  | Task                                                                                                                                                                       | Files                                                                                                                                                                                                                     | Deps | Status        | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------- | --- |
| t-1 | **Agent bindings**: `ModuleDefinition.agentRoles` + `ModuleAgentBinding` model + `Module` relation + bind-time role validation + admin binding API (+ this plan)           | `lib/framework/modules/definition.ts`, `prisma/schema/framework-modules.prisma`, `framework_…` migration, `lib/framework/modules/bindings/*`, `app/api/v1/admin/framework/modules/[slug]/agents/**`, `tests/…`, this plan | —    | **available** | —   |
| t-2 | **Module capabilities → registry + scope seam**: `ModuleDefinition.capabilities` + namespaced registration (in-memory + DB metadata) + `assertInModuleScope` refuse-helper | `lib/framework/modules/definition.ts`, `lib/framework/modules/capabilities/*`, `lib/framework/index.ts`, `lib/framework/modules/sync.ts`, `tests/…`                                                                       | t-1  | backlog       | —   |
| t-3 | **Workflow bindings**: `ModuleWorkflowBinding` model (mirror `AiWorkflowTrigger`) + admin API + resolve-bindings→`drainEngine` dispatch function                           | `prisma/schema/framework-modules.prisma`, `framework_…` migration, `lib/framework/modules/workflow-bindings/*`, `app/api/v1/admin/framework/modules/[slug]/workflows/**`, `tests/…`                                       | t-1  | backlog       | —   |
| t-4 | **Knowledge grants**: grant a module's docs/tags to its bound agents via the existing restricted-access system + cache invalidation                                        | `lib/framework/modules/knowledge/*`, `app/api/v1/admin/framework/modules/[slug]/knowledge/**`, `tests/…`                                                                                                                  | t-1  | backlog       | —   |

**Four promoted PRs** (matches the parent plan's indicative `~4`). Honest sizing caveats
([[planning-retro#B1]]):

- **t-1 is the anchor and the heaviest** — it introduces the binding pattern (model +
  service + API + the `ModuleDefinition.agentRoles` extension + bind-time validation) that
  t-3/t-4 then repeat in miniature. If it runs long, the `agentRoles` definition extension +
  model can split from the API into a t-1a/t-1b, but plan it as one and decide at build.
- **t-4 is the lightest and may fold.** §4.2 is explicit that knowledge needs **"no new
  mechanism at all"** — the grant pivots, resolver, and cache invalidation all exist. t-4 is
  a thin convenience layer (a module-declared knowledge scope + a helper that applies grants
  to bound agents + invalidates). If it lands commit-sized, **fold it into t-1** (bindings)
  rather than ship a sliver PR (the B1 rule). Promoted separately for now to keep the four
  attachments legible; collapse at build time if warranted.
- **t-2 and t-3 are independent of each other** (both depend only on t-1's binding
  substrate), so they can build in either order or in parallel.

### t-1 · Agent bindings — the binding pattern, established once

The anchor: bind an `AiAgent` into a module seat, and stand up the model + service + API
shape the later tasks reuse. A6 + A7.

- **`lib/framework/modules/definition.ts`** — add **`agentRoles?: string[]`** to
  `ModuleDefinition` (the named seats a module declares; the header already reserves it).
  Free-form strings (X1); an app declares e.g. `['companion','reviewer']`. Optional — a
  module with no agent seats declares none.
- **`prisma/schema/framework-modules.prisma`** — add **`ModuleAgentBinding`** (mirror
  `AiAgentCapability`):
  - `id`, `moduleId`, `agentId`, `role String`, `isPrimary Boolean @default(false)`,
    `config Json?`, timestamps.
  - `module Module @relation(onDelete: Cascade)` + add the back-relation
    `agentBindings ModuleAgentBinding[]` to `Module`; `agent AiAgent @relation(onDelete: Cascade)`
    - back-relation on `AiAgent`.
  - `@@unique([moduleId, agentId, role])` (spec §4.2 sketch), `@@index([moduleId])`,
    `@@index([agentId])`, `@@map("framework_module_agent")`.
  - **`AiAgent` back-relation caveat (X6):** adding `moduleAgentBindings ModuleAgentBinding[]`
    to the core `AiAgent` model is a one-line back-relation in a Sunrise-owned schema file.
    Prisma requires the reverse side for the relation to compile. This is the **minimum**
    edit (a relation field naming a `framework_*` model, no new column on `ai_agent`), the
    same shape as the `SlotValue`→`User` hand-FK f-slots landed. Confirm at build whether
    Prisma will accept the FK **without** the back-relation field (some versions do via
    `@relation` on one side only); if a back-relation is unavoidable, keep it to the single
    array field and note it as a deliberate, minimal cross-tier touch (not a behaviour change).
- **Migration** — one `framework_…`-named migration, `framework_*` tables only;
  `--create-only` then **strip the spurious pgvector/tsvector `DROP INDEX`** (the
  per-migration footgun, [[planning-retro#B13]]); drift-check green.
- **`lib/framework/modules/bindings/`** — the binding service (the only writer of
  `framework_module_agent`): `bindAgent({ moduleSlug, agentId, role, isPrimary?, config? })`
  (validates `role ∈` the registered module's `agentRoles`, else `ValidationError`; enforces
  one primary per module if `isPrimary`), `unbindAgent(...)`, `listModuleBindings(moduleSlug)`,
  `setPrimary(...)`; `logAdminAction` per mutation; P2002 → `ValidationError`.
- **Admin API** under `app/api/v1/admin/framework/modules/[slug]/agents/` — `GET` (list
  bindings for a module), `POST` (bind — Zod body), `DELETE` / `PATCH` (unbind / toggle
  primary). All `withAdminAuth`, Zod bodies (`/pre-pr` 4j), audit via the service, rate-limit
  automatic. **APIs only — the seat-binding UI is f-ops-views** (reconciliation #1).
- **`runtimePromptManaged`** — no build; document that a companion agent bound into a
  primary seat is expected to carry the flag (its seed is f-facilitation-agents).
- **Done when:** an admin can bind/unbind an agent into a declared module seat through the
  API, role validity is enforced against the module's `agentRoles`, a module exposes its
  bindings, every mutation is audited, a fresh fork boots with an empty
  `framework_module_agent` table; **gates green — `/pre-pr` → `/security-review` →
  `/code-review`** (retro B4).

### t-2 · Module capabilities → the one registry, namespaced + scope-refusal seam

A8: module capabilities in the single global registry, namespaced, scope carried by the
generic `CapabilityContext.scope` map.

- **`lib/framework/modules/definition.ts`** — add **`capabilities?: BaseCapability[]`** (or
  a light factory list) to `ModuleDefinition` (header already reserves it). Each is an
  ordinary `BaseCapability`; the framework owns the namespacing, so a module author writes a
  bare tool name.
- **Namespaced registration** — a module's capabilities register under
  **`module-slug.tool`** (the **slug**; A8 collision-prevention). Two layers, mirroring the
  built-ins:
  - **in-memory handler** — `capabilityDispatcher.register(...)` for each, from a new
    `registerRegisteredModuleCapabilities()` called in **`initFramework()`** (sync, no DB).
  - **DB metadata** — upsert an `AiCapability` row per namespaced slug in a new
    `syncRegisteredModuleCapabilities()` added to **`syncFramework()`** (async), so a grant
    (`AiAgentCapability`) can reference it. Set-based reconcile with the empty-registry no-op
    ([[planning-retro#B10]], the f-slots boot-reconcile discipline).
  - **slug vs LLM function name** (reconciliation #2) — the registry key/slug is dotted
    `module-slug.tool`; the `functionDefinition.name` the LLM sees uses a provider-safe
    transform (settle the exact form here). Unit-test that the name is provider-legal.
- **`assertInModuleScope(context, moduleSlug)` refuse-helper** — a small framework helper a
  module capability calls at the top of `execute()`: reads `decodeScope(context.scope)`
  (`lib/framework/shared/scope.ts`), and if a `moduleSlug` scope is present and does not
  match, returns a structured refusal ("capability X is scoped to module Y"). **Default
  posture for the interim window** (reconciliation #3): decide and document the missing-scope
  behaviour — most likely **allow when no `moduleSlug` scope is present** (unscoped call,
  pre-f-guidance) and **refuse only on an explicit mismatch**, so the helper is safe before
  f-guidance populates scope and becomes enforcing the moment it does. Pure function →
  exhaustive unit tests (present-and-match, present-and-mismatch, absent).
- **Done when:** a registered module's capabilities appear in the global registry under
  `module-slug.tool` with a provider-legal function name and an `AiCapability` row per slug;
  a module capability can refuse an explicit out-of-scope call via the helper; unscoped calls
  behave per the documented interim posture; boot reconcile is set-based with an
  empty-registry no-op; **gates green** (retro B4).

### t-3 · Workflow bindings — event → workflow, over the real execution machinery

§4.2: "when X happens in this module, run workflow Y." Reconciliation #4 (drainEngine, not
hooks).

- **`prisma/schema/framework-modules.prisma`** — **`ModuleWorkflowBinding`** (mirror
  `AiWorkflowTrigger`): `id`, `moduleId`, `eventType String`, `workflowId`,
  `inputTemplate Json?` (the `AiWorkflowSchedule` precedent), `enabled Boolean @default(true)`,
  timestamps; `module Module @relation(onDelete: Cascade)` + `Module.workflowBindings`
  back-relation; `workflow AiWorkflow @relation(...)` + back-relation caveat as in t-1;
  `@@unique([moduleId, eventType, workflowId])`, `@@index([moduleId])`,
  `@@map("framework_module_workflow")`. Migration + DROP-INDEX strip (B13).
- **`lib/framework/modules/workflow-bindings/`** — the service (`bindWorkflow` /
  `unbindWorkflow` / `listModuleWorkflowBindings`) **and** the dispatch function
  **`runModuleWorkflowBindings(moduleSlug, eventType, payload)`**: resolve enabled bindings
  for `(moduleSlug, eventType)`, and for each, follow the standard pattern — load the
  workflow + its `publishedVersion`, render `inputTemplate` against `payload`, create a
  `PENDING`/`RUNNING` `AiWorkflowExecution` pinning `publishedVersion.id`, then
  `void drainEngine(execution.id, { id, slug }, definition, inputData, userId, versionId)`.
  Skips (with a `logger.warn`) a binding whose workflow has no published version.
- **Admin API** under `app/api/v1/admin/framework/modules/[slug]/workflows/` — `GET`/`POST`/
  `DELETE`/`PATCH` bindings; `withAdminAuth`, Zod bodies, audit. (Views → f-ops-views.)
- **Event source — coordination note (no hard dep edge):** nothing _calls_
  `runModuleWorkflowBindings` yet; the module-lifecycle event dispatch is **f-engagement**
  (08). Ship the dispatch function callable/testable directly (mock `drainEngine`, assert it
  runs once per matching enabled binding with the pinned version); f-engagement (or a small
  shared emit point) wires the real event later — mirrors the 08/09 `JourneyEvent`
  coordination.
- **Done when:** an admin can bind a `(moduleSlug, eventType) → workflow`; calling
  `runModuleWorkflowBindings` runs each enabled binding's **published** workflow via
  `drainEngine` with the pinned version, skipping unpublished ones; disabled bindings don't
  fire; **gates green** (retro B4).

### t-4 · Knowledge grants — the module's corner of the material (thin)

§4.2: "no new mechanism at all." Reuse `resolveAgentDocumentAccess` + the grant pivots.

- **`lib/framework/modules/knowledge/`** — a thin service that, given a module and its bound
  agents, applies **document/tag grants** to those agents through the existing pivots
  (`AiAgentKnowledgeDocument` / `AiAgentKnowledgeTag`), flipping each agent to
  `knowledgeAccessMode: 'restricted'` where appropriate, and calls **`invalidateAgentAccess(agentId)`**
  after every mutation (the resolver memoises for 60s). Optionally a module-declared knowledge
  scope (tags/docs) on `ModuleDefinition` if the shape warrants — **decide at build**; the
  minimum is an API to grant a bound agent the module's docs/tags.
- **Admin API** under `app/api/v1/admin/framework/modules/[slug]/knowledge/` — grant/revoke
  a document or tag for the module's bound agents; `withAdminAuth`, Zod, audit.
- **Fold decision (B1):** if this lands commit-sized (very likely, since the mechanism is
  entirely pre-existing), **fold into t-1** and drop t-4. Kept separate here for legibility;
  collapse at build time.
- **Done when:** a module's bound agent can be granted the module's documents/tags through
  the API, the grant is enforced at search time by the **existing** `resolveAgentDocumentAccess`
  path (no new enforcement code), the access cache is invalidated on mutation; **gates green**
  (retro B4). _Or_ folded into t-1 with the same guarantees.

## Boundary & forkability notes

- **Everything is framework-tier.** All `lib/framework/modules/**` code imports core only
  through the allowed framework→core direction (the capability dispatcher,
  `resolveAgentDocumentAccess`, `drainEngine`, `logAdminAction`, `@/lib/api/errors`,
  `@/lib/db/client`); the boundary CI (f-bootstrap t-2) covers both ways. The new admin
  routes sit under the framework-tier ESLint glob f-module-core opened. The **one** core-side
  touch is a Prisma **back-relation field** on `AiAgent` / `AiWorkflow` (t-1/t-3) if Prisma
  requires it — a relation field naming a `framework_*` model, no new core column, the
  minimal `SlotValue`-style seam (confirm necessity at build).
- **The scope seam stays generic.** f-module-bindings reads/writes only the framework-side
  keys of `CapabilityContext.scope` via `lib/framework/shared/scope.ts` — **zero framework
  vocabulary enters core** (X6/A8). Core still names no framework concept.
- **Framework registers from its own boot path.** Module capabilities register via
  `initFramework()`/`syncFramework()` (the framework's hooks), **never** by filling the leaf
  `lib/app/capabilities.ts` seam — that scaffold stays empty for Daybreak's own forks
  (three-tier model). `initApp()`'s frozen sequence is unchanged.
- **A fresh fork boots with empty binding tables** — no seed. Daybreak declares no modules,
  so no bindings, no namespaced capabilities, no grants exist until a leaf app declares a
  module and an admin binds into it. Nothing to strip.

## Open questions

- **`AiAgent` / `AiWorkflow` back-relation necessity (t-1/t-3).** _Resolved in t-1 (PR #33):_
  **no core edit needed.** `agentId` is a **plain scalar FK** (no Prisma `@relation` on either
  side); the `ON DELETE CASCADE` to `ai_agent` is hand-written in the migration (the f-slots
  `SlotValue.userId` pattern). Prisma compiles fine with no reverse field on `AiAgent`, so the
  boundary-clean hand-FK — not a back-relation — is the shape. **t-3 does the same for
  `ModuleWorkflowBinding.workflowId → ai_workflow`.**
- **Interim scope posture (t-2).** The refuse-helper's missing-`moduleSlug` behaviour
  (recommended: allow-when-absent, refuse-on-mismatch) governs safety before f-guidance
  populates scope. Confirm the posture is the one f-guidance will want to _tighten into_
  (absent → refuse) rather than reverse.
- **Capability function-name transform (t-2).** Pick the exact slug→provider-legal-name
  transform (prefix with separators normalised, or bare tool name) and confirm no collision
  across two modules' identically-named tools once the prefix is normalised out of the
  function name.
- **t-4 fold vs standalone.** Decide at build whether knowledge grants warrant a PR or fold
  into t-1 (B1). Leaning fold.
- **Event-source coordination (t-3).** f-engagement (08) owns the module-lifecycle event
  emission that calls `runModuleWorkflowBindings`. Whichever of 07-t3 / 08 lands the shared
  emit point first owns it; coordinate rather than both defining it (the 08/09 `JourneyEvent`
  pattern).

## Deferred follow-ups

Tracked here rather than left in a PR comment (a deferral needs a home). Action _within this
feature_ — t-3/t-4 are the natural trigger, not a separate later effort.

- **Consolidate the duplicated route/service plumbing when t-3/t-4 add the 3rd–4th copies
  (rule of three).** Flagged by t-1 `/code-review` (PR #33): `parseModuleSlug` / `parseBindingId`
  verbatim-duplicate f-map's `parseMapSlug` (differing only in the noun); the `P2002 →
ValidationError` narrowing is re-hand-rolled in `bindings/service.ts` and f-map's
  `version-service.ts`; and "resolve module by slug or 404" appears in both `bindings/service.ts`
  and `bindings/queries.ts`. Deliberately **not** fixed in t-1 — extracting a shared
  `parseSlugParam(raw, label)` / `parseCuidParam(raw, label)` (→ `lib/validations/common`) and a
  `mapUniqueConstraintError(err, …)` helper spans f-map + f-module-bindings, so it wants doing
  once with enough call sites to shape it right, not churned into the first leaf. **t-3
  (workflow bindings) and t-4 (knowledge) will each add another `parseXSlug` + P2002 map — that
  is the 3rd/4th copy; extract the shared helpers then instead of copying a 4th time.** Cost of
  not doing it: a fix to the slug rule or error message in one leaf silently misses the others.

## Done when (feature)

An admin can make a registered module _functional_ through `/api/v1/admin/framework/modules/[slug]/…`:
bind agents into declared seats, have the module's namespaced capabilities live in the one
global registry and refuse out-of-scope, bind module events to published workflows that run
via the real execution engine, and grant bound agents the module's knowledge — every
mutation audited, all four attachments API-first with UI deferred to f-ops-views, the whole
built framework-tier with the scope seam staying generic (zero framework vocabulary in
core). A fresh fork boots with empty binding tables, nothing to strip. No upstream Sunrise
issue (fourth pure framework-tier feature). **Unblocks `f-atlas` (16).**

## References

- [[plan#07 · `f-module-bindings` — agent / workflow / knowledge bindings|plan.md feature 07]] — parent.
- [[framework-architecture#4.2 Agents, capabilities, workflows — bindings, not ownership|spec §4.2]] +
  Appendix A (A6 / A7 / A8, X1, X6).
- [[f-module-core]] — the sibling module-spine feature; the API-first / defer-page-to-f-ops-views
  precedent, the boot-reconcile and admin-namespace patterns this builds on.
- [[f-map]] — the admin-route + test-split conventions (contract test mocks the service, no
  `@/lib/framework` import).
- [[f-slots]] — the boot-reconcile discipline (B10) and hand-FK-to-core caveat (B11) the
  binding pivots echo.
- [[building-a-feature]] — the execution rhythm.
- [[planning-retro]] — fold f-module-bindings's execution lessons here (§B) as they surface.

---
name: f-facilitation-agents
feature: 13 · f-facilitation-agents
epic: Framework v1
status: in flight (dep f-guidance shipped ✅)
owner: John
depends_on: f-guidance (shipped — #49 / #51 / #52 / #57 / #59 / #61, for the guidance capability family agents are granted + the t-5 surface pattern this mirrors) · f-module-bindings (shipped — #33 / #35 / #50 / #53, for the `ModuleAgentBinding` pattern this mirrors)
spec: framework-architecture.md §5.4 (the facilitation agent family — "AiAgent rows bound to the facilitation layer through the same binding pattern as modules; one binding mechanism, two scopes") · §4.2 (the binding pattern it mirrors) · §5.5 (the facilitator/supervisor persona) + Appendix A — #303 (`isSystem:false` seed scaffold) · #304 (`runtimePromptManaged` honesty flag)
parent: plan.md
opened: 2026-07-06
---

# f-facilitation-agents — the facilitation agent family + surface-scoping

> Feature-level build plan for **`f-facilitation-agents`** (13). Parent:
> [[plan#13 · `f-facilitation-agents` — facilitation agent family|plan.md]]. Binding _how_:
> [[framework-architecture#5.4 Guidance — "what would serve the user best right now"|spec §5.4]]
> — the facilitation family (onboarding/orientation/synopsis/state/path + the facilitator
> persona) are ordinary `AiAgent` rows bound to a **facilitation scope** by role, **granted
> the guidance capabilities** f-guidance shipped, and reached through their own surface. "One
> binding mechanism, two scopes": this feature builds the **second** scope (the first is
> `f-module-bindings`' per-module scope). Sizing: **task = one PR** (~200–600 lines).

## Intent

`f-guidance` (shipped) built the guidance capability family and the **module** surface (a
module's chat companion resolves the module's bound primary agent and populates scope). The
spec's facilitation anatomy has a second agent scope the guidance layer serves: a **flat,
deployment-wide family of facilitation seats** — onboarding/discovery, orientation, synopsis,
state, path/progress, and the distinct **facilitator** persona — that a user meets at
non-module moments (welcome, check-ins, orientation, a progress synopsis). The spec is
emphatic that this needs **no new agent machinery** (§5.4): they are `AiAgent` rows bound
through the **same pattern as modules**, granted the guidance capabilities instead of module
tools. This feature is that second binding scope + the surface that reaches it.

The closest shipped analog is `f-module-bindings`' `ModuleAgentBinding` + `resolveModuleSurface`

- the module surface chat route — f-facilitation-agents is the **same shape over a facilitation
  role** instead of a module.

## What ships here, and what deliberately does not

**In scope.**

- **`FacilitationAgentBinding`** — the binding that maps a **facilitation role → an `AiAgent`**
  (mirroring `ModuleAgentBinding`'s hand-FK discipline), plus a framework-owned
  **`FACILITATION_ROLES`** vocabulary the role validates against, and the bind/unbind/list
  service + admin **API** (API-first; the binding _UI_ is `f-ops-views` (15), exactly as the
  module binding API deferred its UI).
- **The facilitation surface** — a framework-owned chat route that opens (or resumes) a
  facilitation surface for a **role**, resolving that role's bound agent and streaming through
  the core handler — mirroring f-guidance's `resolveModuleSurface` + module chat route, but keyed
  on role, not on a module's primary seat.

**Out of scope** (owned elsewhere / a later phase, so no dead surface lands early):

- **Typed facilitation policies** (relevance/maturity gating, guard minimums per scope,
  escalation pathways, auto-approval risk classes; spec §5.5) → **`f-policies` (17)**. The
  board's indicative "per-scope guard settings" task is deferred there — it needs the
  `FacilitationPolicy` typing f-policies owns, not a one-off tweak of per-agent guard columns
  here.
- **The self-proposed structure-change (emergence) pipeline** (§5.5) → **`f-emergence` (18)**.
- **The binding admin UI + facilitation-surface pages** → **`f-ops-views` (15)** (this feature
  ships the binding + surface **APIs** those pages drive).
- **The composition/atlas view** → **`f-atlas` (16)**.
- **Capability-grant _mechanism_** — agents are granted capabilities through the **existing
  `AiAgentCapability` pivot + admin API** (Sunrise-core); this feature introduces no new
  granting machinery. It only ships a documented **role → recommended guidance capabilities**
  reference so an operator (or a seed) knows which of the five guidance caps each role wants.

## Reconciliation with current repo reality — the design decisions

Organising principle, carried from [[f-guidance]] / [[f-slot-capture]]: **ship nothing a fork
has to delete**, and **follow the shipped code, not the rev-16 spec sketch**. Decisions
(2026-07-06):

1. **`FacilitationAgentBinding` mirrors `ModuleAgentBinding`'s _shape_ but is a FLAT, parentless
   `(agentId, role)` map — there is no facilitation entity to key on.** A module binding keys on
   `moduleId → Module` because a `Module` row exists (registry-synced). Facilitation has **no
   analogous per-instance row** (`framework-facilitation.prisma` holds only `FacilitationGraph`
   /`…Version`/`UserJourney`/`UserNodeState`/`JourneyEvent`; `FacilitationGraph` is the authored
   _map_, never the agent-family host). The spec (§5.4) and board describe a **flat per-app
   role→agent map**, not a per-graph or per-node binding. So the model drops `moduleId`, keeps
   the same **hand-FK discipline** from `ModuleAgentBinding` (`agentId` a **plain scalar FK, no
   Prisma `@relation`**; `ON DELETE CASCADE` to `ai_agent` **hand-written in the migration** SQL,
   B11/B13; reads **batch-stitch** the agent's display fields + the `deletedAt` tombstone marker,
   never `include`), and enforces **one agent per facilitation seat** via `@@unique([role])`
   (a role is a seat — like the module's single-`isPrimary`, but the role _is_ the seat, so no
   `isPrimary` column is needed). A `config Json?` per-binding override carries over. (If
   per-graph facilitation is ever wanted, a later nullable `graphSlug` narrows the seat — a
   forward-compatible additive change, not a rewrite; not built now.)

2. **Role is validated against a framework-owned `FACILITATION_ROLES` constant, not a registry.**
   A module binding validates `role` against the module's declared `ModuleDefinition.agentRoles`
   (`assertModuleSeat` reads the in-memory registry). Facilitation has **no per-instance
   `agentRoles`** — the roles are **framework-defined and fixed**. So introduce
   `FACILITATION_ROLES` (a `const` in `lib/framework/facilitation/agents/`, mirroring how
   `journey/vocabulary.ts` holds `NODE_STATE_STATUS`): `onboarding · orientation · synopsis ·
state · path · facilitator`. The bind service validates `role ∈ FACILITATION_ROLES` in code
   (a `ValidationError` otherwise), replacing the module path's registry lookup.

3. **The bind/unbind/list service + admin API mirror the module binding surface, minus the
   module.** Reuse the shared error mapping (`mapPrismaWriteError` / `rethrowBindingWriteError`
   — P2002 on `@@unique([role])` → a clean `ValidationError`, P2025 → 404), the shared route-param
   parsers, `logAdminAction`, and the `withAdminAuth` route shape. The admin routes live under a
   framework segment (e.g. `app/api/v1/admin/framework/facilitation/agents/`) — the same
   `admin/framework/**` tier the module binding routes use (no eslint-boundary change needed,
   unlike f-guidance t-5's _consumer_ segment). **API-first**: the binding management pages are
   `f-ops-views` (15).

4. **The facilitation surface route mirrors f-guidance t-5 but resolves by ROLE, and needs NO
   scope threading.** `resolveFacilitationSurface(userId, role)` mirrors `resolveModuleSurface`:
   resolve the role's bound agent (there is exactly one — `@@unique([role])` — so no
   `isPrimary` pick), **carry over the `visibility === 'public'` gate** (the surface is
   end-user-facing; an `internal`/`invite_only` agent → no surface → 404 — the same ACL fix
   f-guidance t-5 made), resume the most-recent active `AiConversation` where
   `contextType='facilitation'` / `contextId=role`, and stream through the core `streamChat`.
   **Unlike the module surface, it populates NO `scope` map**: the guidance capabilities are
   **scope-agnostic** (`get_journey_state` &c. read `context.userId` + `args.graphSlug`, never
   `context.scope`), so "surface-scoping" for facilitation is purely _which agent answers on
   which surface_, not capability refusal. The route lives at
   `app/api/v1/framework/facilitation/[role]/chat/stream/route.ts` (the consumer framework
   segment f-guidance t-5 already registered in the boundary configs — no boundary change needed).

5. **Capabilities are granted through the existing `AiAgentCapability` pivot — no new
   mechanism; ship a role→cap _reference_, not an auto-grant.** "Granted the guidance
   capabilities" = `AiAgentCapability` rows FK'd to the already-synced guidance `ai_capability`
   slugs (`get_journey_state`, `get_next_steps`, `get_progress_synopsis`, `suggest_focus`,
   `request_transition` — synced by `syncFramework()` at boot). An operator grants them via the
   **existing** agent-capability admin API. This feature ships a documented **role → recommended
   caps** map (`state`/`orientation` → `get_journey_state`; `path` → `get_next_steps`; `synopsis`
   → `get_progress_synopsis`; `facilitator` → `suggest_focus`; + `request_transition` where a role
   moves the journey) as guidance, **not** an auto-grant-on-bind — auto-granting would couple the
   binding to capability lifecycle (revoke-on-unbind, re-grant-on-role-change) for no real gain,
   and the grant is already a first-class admin operation. Binding and granting stay decoupled
   (bind = which role; grant = what it can do).

6. **`runtimePromptManaged` (#304) is a no-op honesty flag the runtime never reads** — it only
   drives the admin Instructions-tab callout so an operator isn't misled into tuning stored
   prompt fields a per-call-prompt agent ignores. A facilitation agent that builds its prompt
   per call sets it `true`; there is **nothing to build** for the flag beyond setting it on any
   agent this feature seeds/documents. Not a task.

## The one open decision — RESOLVED: mechanism-only (John, 2026-07-06)

**Seed a default facilitation family, or ship mechanism-only?** The board's indicative task 2
said "agent seeds via the `isSystem:false` scaffold (#303)". But **ship-nothing-a-fork-deletes**
(and the spec's own "they are `AiAgent` rows" framing — agents are per-deployment config: persona,
model, voice, guardrails) pulled the other way.

**Decided — mechanism-only.** Ship the binding + `FACILITATION_ROLES` + the surface + the role→cap
reference; a fork/app creates its **own** facilitation agents (its persona, its model), grants them
the guidance caps, and binds them to roles. Nothing to delete; the mechanism is complete and
immediately usable. The feature is therefore **2 PRs** (t-1 binding, t-2 surface) — the conditional
seed task (**t-3**) is **dropped**. _(If a fork later wants a bootable default family, it seeds its
own via the #303 `isSystem:false` scaffold — the mechanism this feature ships makes that trivial.)_

Everything else in this plan is settled; this is the single product-scope fork worth the owner's
call before t-3 is (or isn't) promoted. _(Per [[planning-retro#B20|B20]]: resolve the tractable
questions inline, flag only the genuine product fork — this is it.)_

## Reuse anchors found in-tree

- **The binding pattern** — `ModuleAgentBinding` (`prisma/schema/framework-modules.prisma`);
  `bindAgent`/`updateBinding`/`unbindAgent` + `assertModuleSeat` + `rethrowBindingWriteError`
  ([`modules/bindings/service.ts`](../../lib/framework/modules/bindings/service.ts)); the
  `ModuleAgentBindingView` batch-stitch + `deletedAt` tombstone
  ([`modules/bindings/queries.ts`](../../lib/framework/modules/bindings/queries.ts)); the
  `bindAgentBodySchema` + param parsers
  ([`modules/bindings/api-schemas.ts`](../../lib/framework/modules/bindings/api-schemas.ts));
  the admin routes (`app/api/v1/admin/framework/modules/[slug]/agents/`).
- **The surface pattern** — `resolveModuleSurface` + `ModuleSurface`
  ([`guidance/surface.ts`](../../lib/framework/guidance/surface.ts)) + the module chat route
  (`app/api/v1/framework/modules/[slug]/chat/stream/route.ts`), including the `visibility ===
'public'` gate and the `rateLimitRpm` passthrough.
- **The guidance capabilities to grant** — `guidanceCapabilities` (five slugs)
  ([`guidance/capabilities/index.ts`](../../lib/framework/guidance/capabilities/index.ts)),
  synced as `ai_capability` rows by `syncFramework()`.
- **Hand-FK + shared plumbing** — `mapPrismaWriteError`
  ([`shared/prisma-errors`](../../lib/framework/shared)), `parseSlugParam`/`parseCuidParam`
  ([`shared/route-params`](../../lib/framework/shared)), `logAdminAction`, the B11/B13 migration
  discipline (hand-written cascade + partial-unique index, `--create-only`).
- **Vocabulary precedent** — `NODE_STATE_STATUS`
  ([`facilitation/journey/vocabulary.ts`](../../lib/framework/facilitation/journey/vocabulary.ts))
  is the shape `FACILITATION_ROLES` mirrors.
- **The honesty flag** — `AiAgent.runtimePromptManaged` (`orchestration-agents.prisma`), read by
  no runtime path (admin-UX only).

## Test strategy (vitest — no live DB) — stated up front (B9)

- **The binding service** — mock prisma + the role constant; unit-test `role ∉ FACILITATION_ROLES`
  → `ValidationError`, a second agent for a taken role → the `@@unique([role])` P2002 mapped to a
  clean `ValidationError`, unbind/list (batch-stitch + `deletedAt` filtering), and a real-DB
  **erasure/cascade** smoke (the hand-FK `agentId → ai_agent` cascade, like the module binding).
- **The surface resolver** — mock the binding query + prisma + `getSlotHeads`-free path; assert the
  role's agent resolved, the **visibility gate** (internal → null), resume-vs-new, and no `scope`
  in the returned surface.
- **The routes** — mock the service/resolver + `streamChat`; assert the admin binding API (bind →
  201, bad role → 400/validation) and the surface route (role resolves → `streamChat` with
  `contextType='facilitation'`/`contextId=role`, no surface → 404, invalid body → 400, rate caps).
- **Migration drift** — the new `framework_facilitation_agent` table + hand-written cascade +
  `@@unique([role])` go through `--create-only` and the drift check (B13).

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                                                                                           | Files                                                                                                                                                                                         | Deps | Status                | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------- | --- |
| t-1 | **`FacilitationAgentBinding` + `FACILITATION_ROLES` + binding API (anchor).** The flat `(agentId, role)` model (hand-FK cascade + `@@unique([role])`, migration `--create-only`); the role constant; the bind/unbind/list service (role validated against the constant; shared error mapping) + the `withAdminAuth` admin API. Mirrors `ModuleAgentBinding`, minus the module. | `prisma/schema/framework-facilitation.prisma`, `lib/framework/facilitation/agents/{roles,binding-service,binding-queries}.ts`, `app/api/v1/admin/framework/facilitation/agents/**`, `tests/…` | —    | backlog               | —   |
| t-2 | **The facilitation surface route.** `resolveFacilitationSurface(userId, role)` (mirror `resolveModuleSurface`, keyed on role, `public`-visibility gate, no scope) + the framework consumer chat route `…/framework/facilitation/[role]/chat/stream` tagging `contextType='facilitation'`. Plus the documented role→recommended-caps reference.                                 | `lib/framework/facilitation/agents/surface.ts`, `app/api/v1/framework/facilitation/[role]/chat/stream/route.ts`, `tests/…`                                                                    | t-1  | backlog               | —   |
| t-3 | **_(Conditional — pending the seed-vs-mechanism decision.)_ Seed the facilitation family.** Six `isSystem:false` (#303) facilitation agents + their role→cap grants + role bindings, handling the seed→boot-sync ordering. Promoted **only if** the owner chooses to ship a default family (see _The one open decision_).                                                      | `prisma/seeds/0NN-facilitation-agents.ts`, `tests/…`                                                                                                                                          | t-2  | backlog (conditional) | —   |

**Sizing (B1): 2 promoted + 1 conditional.** The board's ~3 comes from its three indicative
tasks (binding · seeds · guard-settings). Reconciled: **guard-settings is deferred to `f-policies`
(17)** (it needs that feature's policy typing, not a premature per-agent tweak), and **seeds are
conditional** on the product decision above. So the honest core is **2 PRs** (binding, surface);
a third (seeds) promotes only if the owner opts to ship a default family. **t-1 is the anchor**
(the binding is what "facilitation agent family" means); **t-2 depends on t-1** (a surface needs a
bound agent to resolve).

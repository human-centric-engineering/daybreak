---
name: f-policies
feature: 17 · f-policies
epic: Framework v1
status: in flight (dep f-facilitation-agents shipped ✅) — planned, tasks promoted
owner: John
depends_on: f-facilitation-agents (shipped — #68 / #70, for the facilitation seats + `FACILITATION_ROLES` these policies gate + the `resolveFacilitationSurface` choke point relevance-gating hooks) · f-guidance (shipped, for `assembleJourneyContext` — the journey-context assembler relevance-gating reuses)
spec: framework-architecture.md §5.5 (governance — the typed policy kinds) · Appendix A — F14 (governance = existing guards + supervisor/evals + audit/approvals + typed policy kinds) · F15 (escalation pathways) · F16 (policy can mandate inline guard modes per scope) · §9.2 (auto-approval risk taxonomy — deferred, ship `autoApprove: none`)
parent: plan.md
opened: 2026-07-06
planned: 2026-07-06
---

# f-policies — typed facilitation policy kinds

> Feature-level build plan for **`f-policies`** (17). Parent:
> [[plan#17 · `f-policies` — typed facilitation policy kinds|plan.md]]. Binding _how_:
> [[framework-architecture#5.5|spec §5.5]] + Appendix A F14–F16 / §9.2. **Build-ready** — the
> reconciliations below are settled against repo reality (three reconnaissance sweeps of the
> governance surfaces, 2026-07-06) and the tasks are promoted. Sizing: **task = one PR**
> (~200–600 lines).

## Intent

Governance in the framework is mostly **reuse, not reinvention** (F14): Sunrise already ships the
inline guards, the supervisor / evaluation metrics, the approval queue, and the audit log. The **one
new piece** is **policy** — the admin-editable data that says _which governance applies where_. To
stop it becoming a junk drawer, `FacilitationPolicy` is several small **typed policy kinds** under
one table (a `kind` discriminator with a **Zod-validated payload per kind**), never one generic
rules blob (F14).

This is the direct downstream of [[f-facilitation-agents]] (13): that feature shipped the
facilitation seats + the `FACILITATION_ROLES` vocabulary + the `resolveFacilitationSurface` choke
point, and **deferred its per-scope guard settings here** — because a per-agent guard tweak is the
wrong shape; the right shape is a typed policy kind this feature owns. The kinds gate _which agent
roles a user may reach at which stage_, _what guard minimum a scope mandates_, _how a safety signal
escalates_, and _which structure-change proposals may auto-approve_ — data an admin edits, not logic
an agent improvises.

## What ships here, and what deliberately does not

**In scope** — the one new table + four typed kinds:

- **`FacilitationPolicy`** — one table, a free-form `String kind` discriminator, an `enabled` flag, a
  `createdBy` hand-FK (audit attribution), and a per-kind **Zod-validated `payload`**; the
  validate-on-write + CRUD service + `withAdminAuth` API + audit-log write on every mutation.
- **Relevance/maturity gating** (F14 §5.5) — `{stage|region} → allowed roles`, enforced at
  conversation-routing time in `resolveFacilitationSurface`.
- **Guard-minimums per scope** (F16) — a scope can **mandate** an inline guard mode (raise the floor
  to `block`), via a **fork-carried core seam** that adds a policy tier to Sunrise's guard-mode
  resolution.
- **Escalation pathways** (F15) — `(signal, scope) → response`, declarative wiring over the existing
  escalation machinery (guards detect · workflows execute · hooks/notify · audit records).
- **Auto-approval risk knob** (§9.2) — a **stored** policy value, ships `none`; f-emergence (18)
  reads it. No runtime consumer lands here (no `StructureChangeProposal` exists yet).

**Out of scope** (owned elsewhere / a later phase):

- **The structure-change proposal _pipeline_** (schema→invariant→risk→approval→publish) → **`f-emergence` (18)**.
  This feature ships the `autoApprove` **knob** that pipeline will read, not the pipeline.
- **New guard / supervisor / approval-queue / audit machinery** — all **reused** from Sunrise core
  (F14). This feature adds the policy _data_ that configures them.
- **The policy admin UI** → **`f-ops-views` (15)** (API-first, the standing framework split).
- **The auto-approval _risk taxonomy_** (which change classes are safe to auto-approve) — deferred
  (§9.2): empirical, needs a population of real proposals; ship the knob at `none`.

## Reconciliation with repo reality — the design decisions (settled 2026-07-06)

Organising principle, carried from [[f-facilitation-agents]] / [[f-guidance]]: **ship nothing a
fork has to delete**, **follow the shipped code, not the rev-16 spec sketch**, and **confirm "pure
framework-tier" at build, not plan** ([[planning-retro#B17|B17]]).

1. **One table, `kind` discriminator + per-kind Zod payload — `z.discriminatedUnion('kind', […])`,
   mirroring the same-tier `conditionSchema`.** The cleanest precedent is in this very tier:
   `conditionSchema = z.discriminatedUnion('family', [state, slot, temporal])`
   ([`facilitation/map/schema.ts`](../../lib/framework/facilitation/map/schema.ts)) — one
   discriminator column, a per-member payload, unknown-kind rejection as the forward-compat guard.
   `FacilitationPolicy.kind` is a **free-form `String` + a raw-SQL `CHECK` constraint** (never a
   Prisma enum — the platform convention, spec §546: `String` + CHECK keeps values evolvable and
   forks mergeable), and the payload validates through `z.discriminatedUnion('kind', …)`. **Fallback
   (registry-of-schemas):** if any one payload becomes _itself_ a discriminated union, Zod can't nest
   it in the outer union — switch that to the WorkflowStep/`executor-registry` pattern (a
   `Map<kind, schema>` validated per-kind). Not needed for the flat payloads below.

2. **Model shape — flat top-level columns, everything kind-specific in `payload`.** `id`, `kind`,
   `enabled Boolean @default(true)`, `payload Json`, `createdBy String?` (hand-FK → `User`,
   `ON DELETE SET NULL`, **no Prisma `@relation`** — the X6 discipline, migration-hand-written, like
   `ModuleVersion.createdBy` / `f-facilitation-agents`'s FKs; the only FK, since the policy carries
   no personal data — it references roles/scopes by string, not by FK to `AiAgent`), `createdAt`,
   `updatedAt`, `@@index([kind, enabled])`, `@@map("framework_facilitation_policy")`. Resolvers load
   the enabled policies of a kind (indexed) and **match in code** — the table is admin-authored (tens
   of rows), so no JSON-column indexing is warranted. Migration is `--create-only`, `framework_*`-scoped,
   strip Prisma's DROP re-proposals (B13).

3. **Guard-minimums (F16) needs a FORK-CARRIED CORE SEAM — this is not pure framework-tier.**
   Guard-mode resolution is **hardcoded in Sunrise-core
   [`chat/streaming-handler.ts`](../../lib/orchestration/chat/streaming-handler.ts)** at three sites
   (input / output / citation), each a two-tier `agent.<column> ?? settings.<global>` fallback with
   **no policy tier**. Mandating `block` for a scope means interposing a third tier —
   `strictest(agentMode, policyFloor)` where `block > warn_and_continue > log_only`. Per
   [[planning-retro#B19|B19]] (the #385/#403 pattern), add a **generic** core seam —
   `registerGuardFloorContributor((ctx: { contextType, contextId, agentId }) => Promise<Partial<GuardModes>>)`
   — that core consults at those three sites, taking the strictest of the agent mode and any
   contributor floor; **empty registry = prior behaviour**, and the contributor signature carries **no
   framework vocabulary** (so the boundary vocab-scan stays green). The framework registers a
   contributor that reads `guard_minimum` policies for the conversation's scope (`contextId` = the
   facilitation role). Built **fork-first as the final generic shape**, ledgered in [[upstream-asks]],
   with a new Sunrise issue filed. **This makes t-3 the one task that touches core** — isolated
   accordingly (the f-ops-views t-3 precedent of ring-fencing the sensitive change).

4. **Relevance-gating (F14) hooks `resolveFacilitationSurface`, but must assemble journey context
   itself.** The single choke point where a role→agent surface is resolved is
   `resolveFacilitationSurface(userId, role)`
   ([`facilitation/agents/surface.ts`](../../lib/framework/facilitation/agents/surface.ts)) — it owns
   `(userId, role)` and its `null` return is already the 404 path, so a gate slots in with **no new
   error shape** (disallowed → `null` → 404). But the surface loads **no journey context** today, and
   there is **no "current stage/region" field** — position is derived from `UserNodeState` + the graph
   (`node.stage`, `node.region`, `graph.regionOf`). So the gate reuses the guidance-layer assembler
   `assembleJourneyContext` ([`guidance/assemble.ts`](../../lib/framework/guidance/assemble.ts)) to
   load node states, and ships a **new** `deriveCurrentStageRegion(nodeStates, graph)` helper. **Fails
   open:** with no gating policy, all roles are allowed (allow-on-absent — a policy only ever
   _narrows_, mirroring the module-scope posture).

5. **Escalation (F15) is declarative wiring over existing bridges — "always logged" → audit log.**
   Hooks are **outbound-webhook-only** (confirmed; the f-module-bindings finding), so "execute" uses
   the framework's shipped signal→workflow bridge `drainEngine` /
   `runModuleWorkflowBindings`-style dispatch, "notify" reuses the shipped
   `notifyEscalation()` / `escalationConfig`, and **"always logged" lands in the audit log**
   (`logAdminAction`, free-form `entityType`) — **not** `JourneyEvent`, whose vocabulary is
   f-engagement's (08) to extend and which is user-scoped where an escalation record is not. A
   `JourneyEvent` write is the _additional_ path only when the signal is genuinely user-scoped.

6. **Auto-approval (§9.2) ships as a STORED kind with no runtime reader.** There is no risk-class
   concept in the codebase and no `StructureChangeProposal` table (f-emergence isn't built), so the
   knob is a stored policy value (`{ autoApprove: 'none' }`) that **f-emergence (18) reads later** to
   decide whether to skip `pauseForApproval`. It ships here because "typed kinds under one table" is
   _this_ feature's job (cleaner ownership than f-emergence bolting a kind onto f-policies' table),
   and it's cheap (a payload schema, no wiring). Folds into the t-1 spine.

7. **Every mutation writes the audit log; routes are `withAdminAuth`; API-first.** `logAdminAction`
   with `entityType: 'facilitation_policy'`, `action: 'facilitation_policy.{create,update,delete}'`
   (free-form strings — no migration), exactly as the framework's other services already do. The
   policy management UI is [[f-ops-views]] (15). Rate limiting is automatic on `/api/v1/admin/**`.

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Files (indicative)                                                                                                                                                                                                                                        | Deps | Status  | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------- | --- |
| t-1 | **`FacilitationPolicy` spine + the typed-kind pattern + the auto-approval stored kind (anchor).** The table (hand-FK `createdBy`, `--create-only` migration + `kind` CHECK), the `z.discriminatedUnion('kind')` payload validator, the validate-on-write CRUD service (shared `mapPrismaWriteError`), the `withAdminAuth` API, audit on every write; the **auto-approval** kind (`{autoApprove:'none'}`, stored-only — the simplest kind, proving the pattern end-to-end). | `prisma/schema/framework-facilitation.prisma`, `prisma/migrations/…`, `lib/framework/facilitation/policies/{kinds,policy-service,policy-queries,api-schemas}.ts`, `app/api/v1/admin/framework/facilitation/policies/**`, `tests/…`                        | —    | backlog | —   |
| t-2 | **Relevance/maturity-gating kind + enforcement.** The `relevance_gating` payload (`{match:{stage?,region?}, allowedRoles[]}`); the new `deriveCurrentStageRegion(nodeStates, graph)` helper; the gate wired into `resolveFacilitationSurface` (reuse `assembleJourneyContext`; disallowed → `null` → 404; **fail-open** on no policy).                                                                                                                                     | `lib/framework/facilitation/policies/gating.ts`, `lib/framework/facilitation/agents/surface.ts` (add the gate call), `lib/framework/facilitation/policies/kinds.ts` (+ kind), `tests/…`                                                                   | t-1  | backlog | —   |
| t-3 | **Guard-minimums-per-scope kind + the fork-carried core seam.** The generic `registerGuardFloorContributor` seam in core `streaming-handler.ts` (strictest-of, empty-registry = prior behaviour, vocab-free); the framework contributor reading `guard_minimum` policies by scope; the `guard_minimum` payload. Ledger [[upstream-asks]] + file the Sunrise issue.                                                                                                         | `lib/orchestration/chat/streaming-handler.ts` (+ the seam — the one core touch), `lib/framework/facilitation/policies/guard-floor.ts`, `lib/framework/facilitation/policies/kinds.ts` (+ kind), `.context/framework/planning/upstream-asks.md`, `tests/…` | t-1  | backlog | —   |
| t-4 | **Escalation-pathway kind.** The `escalation` payload (`{signal, scope?, response:{routeToRole?, notify?, workflowSlug?, resources?}}`); the resolver that, on a detected signal in scope, dispatches the workflow (via the shipped `drainEngine` bridge), notifies (`notifyEscalation`), and **always logs** (audit; + `JourneyEvent` when user-scoped).                                                                                                                  | `lib/framework/facilitation/policies/escalation.ts`, `lib/framework/facilitation/policies/kinds.ts` (+ kind), `tests/…`                                                                                                                                   | t-1  | backlog | —   |

**Sizing (B1): 4 promoted PRs.** The board's four indicative tasks hold — but re-cut along the
**build-cost seam**, not one-per-kind naïvely: the auto-approval "kind" is too thin to be its own PR
(it's stored data), so it folds into the **t-1 spine** as the pattern-proving first kind; the three
kinds with real enforcement machinery each stand alone because their machinery is genuinely distinct
— **t-2** touches the facilitation surface, **t-3** touches a Sunrise-core file (the one core seam,
isolated), **t-4** composes the workflow/notify/audit bridges. t-2/t-3/t-4 all depend on t-1 and are
mutually independent (parallelisable).

## Open questions — genuinely the owner's (flagged, not parked)

Everything tractable is resolved above. These are the two product-scope forks where a default is
recorded but the owner may steer:

- **Guard-minimums scope granularity.** v1 keys `guard_minimum` on the **facilitation role**
  (`contextId` at the surface — the unit f-facilitation-agents shipped). A **module** scope
  (`contextType='module'`) is an additive future value (the seam's `contextType` already carries it);
  not built in v1 unless wanted. _Default: facilitation-role scope only._
- **Escalation response palette.** The `response` payload ships `routeToRole` / `notify` /
  `workflowSlug` / `resources`. Whether day-one needs all four, or a subset (e.g. notify + log only,
  deferring conversation-rerouting), is a product call. _Default: ship all four; `notify`+log are the
  safety-critical minimum._

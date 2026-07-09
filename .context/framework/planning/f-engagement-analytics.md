---
name: f-engagement-analytics
feature: 21 · f-engagement-analytics
epic: Framework v1.1
status: in flight
owner: John
depends_on: f-engagement (shipped — #103 · #105 · #106 · #107) · f-ops-views (shipped — #66 · #69 · #83 · #84 · #86 · #89 · #94 · #97) · f-atlas (shipped — #104 · #113 · #114 · #116) · reuses the shared `JourneyEvent` stream + `layoutJourney` mapper + `runModuleWorkflowBindings` + the module surface chat route + `updateModuleSettings`
spec: framework-architecture.md §4.3 (stats & engagement) · §5.6 (journey views) · Appendix A — A9 (stats from the insert-only stream, never counters) · X1 (free-form `String` event `type`)
parent: plan.md
opened: 2026-07-09
planned: 2026-07-09
---

# f-engagement-analytics — collective heat/drop-off + dwell + the deferred emit sites

> Feature-level build plan for **`f-engagement-analytics`** (#21), the last v1.1 follow-on.
> Parent: [[plan#21 · `f-engagement-analytics` — the deferred observability layer|plan.md feature 21]].
> Binding _how_: [[framework-architecture#4.3 Stats and engagement|§4.3]] + A9 (derive from the
> insert-only `JourneyEvent` stream, never counters) + X1 (event `type` is a free-form `String`,
> so new kinds are not migrations) + [[framework-architecture#5. Facilitation Structures|§5.6]] (journey
> views). **Build-ready** — reconciled against the tree (the journey/atlas canvases, `getModuleStats`,
> the emit sites, `updateModuleSettings`, and the map schema, 2026-07-09). Sizing follows the parent:
> **task = one PR** (~200–600 lines), **3 PRs** (with split-at-build seams noted).

## Intent

Two shipped features drew a deliberate v1 boundary and named the observability work past it as
"later" ([[planning-retro#B28|B28]], the graveyard pattern — here the _analytics_ half):

- **`f-engagement` (08)** shipped **per-module** stats derived from the stream, but **deferred
  dwell** ("needs sessionization" — [[f-engagement]] t-3a done-when) and deferred a **collective
  journey-heat overlay** (its Open-questions: _"the journey-explorer 'canvas overlay prop' the board
  imagined does not exist in shipped code … a collective heat/drop-off overlay means introducing the
  prop + an aggregate-by-`nodeKey` query — its own scope"_). It also shipped only two emit sites
  (`module.entered`, `module.feedback`) and **deferred `session.started`, `module.completed`, and
  operator `module.status_changed` → workflow trigger** ([[f-engagement]] Open-questions).
- **`f-ops-views` (15)** shipped the **structural** journey explorer (per-user map + replay) and moved
  the **collective heat / drop-off overlays** to 08 under its _host-first, overlay-plugs-in_ promise
  ([[f-ops-views]] decision 1) — but shipped the explorer canvas with **no overlay extension prop**.
  So the host hook it promised does not exist; this feature adds **the host hook _and_ the overlay**.

This feature closes that observability gap: **collective per-node heat/drop-off** over a map (all
users), the deferred **dwell** metric on the module Stats tab, and the deferred **emit sites**. It is
**reuse over reinvention** — every metric is derived from the existing insert-only `JourneyEvent`
stream (A9, no counters), the canvas is the shipped `layoutJourney` + `journey-canvas`, and the
lifecycle trigger is the shipped `runModuleWorkflowBindings`. It adds **no new table** (new `type`
strings are not migrations, X1); the only possible migration is a scale index, shipped only if
warranted (mirrors [[f-engagement]] decision 6).

## Reconciliation with current repo reality (verified 2026-07-09)

Reconciled against the tree, not the board sketch ([[planning-retro#B2]]).

### 1. The explorer/atlas canvases take no overlay slot — the host hook is genuinely missing

- **`journey-canvas.tsx`** ([`components/admin/framework/journey-explorer/journey-canvas.tsx`](../../components/admin/framework/journey-explorer/journey-canvas.tsx))
  takes exactly `{ nodes, edges }`, hard-codes `nodeTypes={journeyNodeTypes}`, and paints node colour
  from `data.status` (per-user tint). There is **no extension slot** — the f-ops-views "overlay prop"
  promise is unkept, exactly as [[f-engagement]]'s Open-questions recorded.
- **`atlas-canvas.tsx`** ([`components/admin/framework/atlas/atlas-canvas.tsx`](../../components/admin/framework/atlas/atlas-canvas.tsx))
  takes `{ nodes, edges, onNodeClick }`, `nodeTypes={atlasNodeTypes}` — its nodes are **composition
  entities** (modules/agents/workflows/knowledge), **not map nodes**, so per-node journey heat does
  **not** project onto it. **Atlas is out of scope for v1 heat** (decision B); the plan's "explorer/atlas
  overlay host prop" reduces to the journey-canvas overlay slot.
- **`layoutJourney`** ([`journey-mapper.ts:65`](../../components/admin/framework/journey-explorer/journey-mapper.ts))
  is **pure and structure-only** (map `definition` → laid-out base nodes + edges via longest-path
  layering, no React/React-Flow runtime imports). It already separates _structure_ (`layoutJourney`) from
  _overlay_ (`toFlowNodes` merges a `statusByNode` map onto base nodes). **This is exactly the seam the
  heat overlay reuses**: a heat page runs `layoutJourney(publishedStructure)` for positions and folds a
  per-node _heat_ value on top instead of a per-user status.

### 2. No cross-user per-node aggregate exists — the heat query is new

- `getModuleStats` ([`engagement/stats.ts:78`](../../lib/framework/engagement/stats.ts)) aggregates
  `JourneyEvent` filtered by **`moduleSlug`** (unique users / entries / completions / returning /
  feedback) — a _module_-scoped aggregate, not _per-node_.
- `listJourneysForAdmin` ([`journey/admin-queries.ts:55`](../../lib/framework/facilitation/journey/admin-queries.ts))
  does `prisma.userNodeState.groupBy({ by: ['journeyId', 'status'] })` — per-journey progress, not
  per-node cross-user.
- **The gap:** a **`groupBy(['nodeKey', 'type'])` over `JourneyEvent`** scoped to _one map's_ journeys.
  `JourneyEvent` has `journeyId` + `nodeKey` but **no `graphSlug` column**
  ([`framework-facilitation.prisma:134`](../../prisma/schema/framework-facilitation.prisma)) — so
  map-scoping goes **through `UserJourney`**: `graphSlug → journeyId set → JourneyEvent where journeyId in set`.
  The engine already stamps `node_entered`/`node_completed` with `journeyId` **and** `nodeKey`
  ([`engine/apply-event.ts:176`](../../lib/framework/facilitation/engine/apply-event.ts)), so heat and
  drop-off are directly derivable — no new emit needed for the heat overlay.

### 3. Dwell was deferred and is genuinely absent

`ModuleStats` ([`stats.ts:56`](../../lib/framework/engagement/stats.ts)) has `uniqueUsers / entries /
completions / returningUsers / feedback` — **no dwell**. `StatsTab`
([`module-detail/stats-tab.tsx`](../../components/admin/framework/module-detail/stats-tab.tsx)) renders
those four cards + feedback. Dwell is a clean additive extension: a new field on `getModuleStats` + one
stat card, computed from the same stream (`module.entered` → the module's `node_completed`, gap-capped).

### 4. Emit sites — what fires today vs the three deferred

- **Fires today:** `module.entered` (surface chat route on a **fresh** conversation —
  [`app/api/v1/framework/modules/[slug]/chat/stream/route.ts:76`](../../app/api/v1/framework/modules/[slug]/chat/stream/route.ts)),
  `module.feedback` (feedback route + `record_feedback` capability). Both go through
  `recordModuleEngagement` ([`engagement/record-engagement.ts:46`](../../lib/framework/engagement/record-engagement.ts))
  — insert `JourneyEvent` **and** fire `runModuleWorkflowBindings`, each limb isolated best-effort.
- **`module.status_changed` is NOT wired:** `updateModuleSettings`
  ([`modules/service.ts:69`](../../lib/framework/modules/service.ts)) already computes a `changes` diff
  (with `status` from/to) and audits it, but calls **no** `runModuleWorkflowBindings`. This is a pure
  operator action with **no subject user**, so it does **not** write a `JourneyEvent` (decision 2 of 08 —
  `JourneyEvent.userId` is NOT NULL) — it fires bindings **directly**. `runModuleWorkflowBindings`
  ([`modules/workflow-bindings/dispatch.ts`](../../lib/framework/modules/workflow-bindings/dispatch.ts))
  is a clean no-op for a module/event with no bindings, so wiring it is safe.
- **`module.completed` needs a completion definition:** map node types are
  `['module','stage','milestone','region']` and `completionMode` is `['once','repeatable']`
  ([`map/schema.ts:26,42`](../../lib/framework/facilitation/map/schema.ts)) — there is **no per-node
  "module terminal" flag**. So completion is derived from the published map + the stream (decision C).
- **`session.started`** is a broader, module-agnostic signal with no natural single trigger — the
  lowest-value of the three (decision D); scoped as optional within t-3.

## The shape decisions (read this first)

Settled; reasoning recorded so a reviewer or resumed session doesn't relitigate. Re-confirm at build
only if the code contradicts ([[planning-retro#B20]]).

### A. Three tasks (the board's ~3 holds), with the split-at-build seam pre-drawn

The board's three indicative items map to three promoted PRs, **mutually independent** (disjoint
subsystems, no shared schema) → any order after this claim PR. **t-1** is the largest (aggregate query +
endpoint + canvas overlay slot + heat surface + legend/toggle); if it exceeds the ~600-line budget at
build, split on the **UI-over-shipped-API seam** ([[planning-retro#B25]]) into **t-1a** (the
`getMapHeat` query + `GET …/maps/[slug]/heat` endpoint — the security/correctness slice) and **t-1b**
(the canvas overlay slot + heat page UI). **t-3** bundles three independent emit sites; if oversized,
split per-site (`module.completed` is the load-bearing one).

### B. Collective heat lives on a NEW map-scoped surface, not the per-journey explorer

The explorer is **per-journey** (one `journeyId`, one user); collective heat is **per-map** (all users).
They don't share a page. So heat mounts on a **new map-scoped surface** — a `/admin/framework/maps/[slug]/heat`
sub-page (the map detail `/maps/[slug]` is the map-_editor_ canvas — a separate heat sub-page reusing the
shared canvas is cleaner than shoehorning a mode into the editor; confirm the exact mount — tab vs
sub-page — at build). It reuses the **pure `layoutJourney`** (structure-only, so it works with zero
per-user state) + the journey-canvas's **new generic overlay slot** (decision 1's seam), folding a
per-node heat value where the explorer folds a per-user status. **Atlas is not a v1 heat host** (§recon
1 — its nodes aren't map nodes). The shared read-only-canvas primitive extraction (the cross-cutting
follow-up, rule-of-three across journey/map/atlas) is **out of scope** — this adds one additive `overlay`
slot to `journey-canvas`, it does not do the three-canvas refactor.

### C. `module.completed` = all the module's map nodes completed (derived, no new schema)

With no per-node terminal flag, the defensible stream-derivable definition: **`module.completed` fires
the first time _every_ `module`-type node bound to the module's slug in the currently-published map has a
`node_completed` event for that user.** Derived from the published map (`nodes where type==='module' &&
moduleSlug===slug`) ∩ the user's `node_completed` events — **no new schema**. The common single-node
module reduces to "that node completed." **Emitted from the transition caller, NEVER inside `applyEvent`**
(the pure engine stays LLM-free/binding-free, F11 — [[f-engagement]] "never edits the pure engine"):
after a `node_completed` with a `moduleSlug` commits, a thin checker recomputes all-nodes-complete and,
if **newly** crossed (no prior `module.completed` event for `(user, module)` — idempotent), calls
`recordModuleEngagement({ type: 'module.completed', … })`. Confirm the exact post-`applyEvent` seam
(the engine drain / `request-transition` path) at build. **This is the one product-semantics call** —
recorded as the default; a future explicit terminal-node marker on the map would refine it (deferred).

### D. `module.status_changed` fires bindings directly (no `JourneyEvent`); `session.started` is optional

- **`module.status_changed`** — an operator lifecycle change has **no subject user**, so it is **not**
  an engagement event (08 decision 2). When `updateModuleSettings` detects `status` changed, it calls
  `runModuleWorkflowBindings(slug, 'module.status_changed', { from, to })` **directly**, fire-and-forget,
  isolated (a dispatch failure never breaks the settings write). No `recordModuleEngagement`, no
  `JourneyEvent` row. This makes an operator's "when this module retires, run workflow Z" fire.
- **`session.started`** — a broad, module-agnostic signal with no crisp trigger. v1 default (if included):
  emit from the surface chat route alongside `module.entered` when the user has **no** `JourneyEvent`
  within a session-gap window (coarse sessionization), `moduleSlug`/`journeyId` null. It is the **most
  negotiable** emit — drop from t-3 if scope-tight; recorded either way.

### E. No speculative index; scale follow-up documented

The heat aggregate filters `JourneyEvent` by a `journeyId` set + groups by `nodeKey` — the existing
`(userId|journeyId, occurredAt)` indexes don't cover it. At single-tenant v1 volume this is fine (mirrors
[[f-engagement]] decision 6 — no speculative index). The scale follow-up (a
`framework_journey_event (journeyId, nodeKey)` index, or a denormalised `graphSlug` column to skip the
journey-id join) is **feature-doc'd, not shipped**. Confirm at build the aggregate stays Prisma-`groupBy`
(no raw SQL needed at v1).

## Which seams this feature builds vs consumes

**Consumes (all shipped, framework-tier):**

| Reuse target                                                                                         | Shipped in                 | Used by   |
| ---------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| `layoutJourney` (pure structure layout) · `JourneyCanvas` · `journeyNodeTypes`                       | f-ops-views (t-5b)         | t-1       |
| `JourneyEvent` stream + `node_entered`/`node_completed` (stamped `journeyId`+`nodeKey`+`moduleSlug`) | f-journey-state / f-engine | t-1 / t-3 |
| `getModuleStats` shape + the `groupBy`/`count` aggregation precedent                                 | f-engagement (t-3a)        | t-1 / t-2 |
| `recordModuleEngagement` (insert + fire bindings, isolated) · `ENGAGEMENT_EVENT_TYPE` vocabulary     | f-engagement (t-1)         | t-3       |
| `runModuleWorkflowBindings` (event → workflow, no-op-safe)                                           | f-module-bindings (t-3)    | t-3       |
| `updateModuleSettings` (status diff already computed) · the surface chat route emit site             | f-ops-views / f-guidance   | t-3       |
| `getPublishedMap` / published `definition` parse · the module registry (`module`-node → slug)        | f-map / f-module-core      | t-1 / t-3 |

**Builds (new, framework-tier):**

- **t-1** — `getMapHeat(graphSlug)` (per-node cross-user aggregate over the stream) + `GET
/api/v1/admin/framework/maps/[slug]/heat` + a generic `overlay?` slot on `journey-canvas` + a heat
  node overlay (intensity + drop-off) + the `/maps/[slug]/heat` page + legend/toggle.
- **t-2** — a `dwell` field on `getModuleStats` (sessionised `module.entered`→`node_completed`) + a
  dwell stat card on `StatsTab`.
- **t-3** — `module.completed` detection + emit (from the transition caller, idempotent) +
  `module.status_changed` direct binding fire in `updateModuleSettings` + (optional) `session.started`;
  new `ENGAGEMENT_EVENT_TYPE` literals (not migrations, X1).

## Framework-tier assessment — expected pure, confirm at build (B17)

Every piece is framework-tier: `lib/framework/engagement/**`, `lib/framework/facilitation/{map,journey,engine}/**`,
`lib/framework/modules/service.ts`, new pages/components under `app/admin/framework/**` +
`components/admin/framework/**`, and the surface/settings routes (already framework). All core
consumption (`withAdminAuth`, `prisma.groupBy`, `serverFetch`, `@xyflow/react`) is in the allowed
direction. **No new table**; the **only** possible migration is the deferred scale index (decision E),
which is `framework_*`-scoped ([[planning-retro#B13]] — strip the spurious pgvector/tsvector `DROP INDEX`).
So the expectation is **pure framework-tier, no upstream Sunrise issue** — confirm at each task; ledger
any core seam that surfaces (the likeliest: a shared read-only-canvas primitive, already the cross-cutting
follow-up, or a post-`applyEvent` transition hook if the `module.completed` emit needs a core seam —
build fork-first and ledger the ask, don't edit the pure engine).

## Test strategy (house style)

Vitest on `happy-dom`, **no live DB** ([[planning-retro#B9]]): mock `@/lib/db/client`, forward
`executeTransaction` to a `tx` mock; real-DB fidelity via `smoke:*` only. Component tests use
`@testing-library/react` (the pattern under `tests/integration/app/admin/**`, e.g. the journey-explorer
tests). Concretely:

- **t-1** — `getMapHeat` over mocked `groupBy`: per-node entries/completions/distinct-users + drop-off
  (entered-not-completed), correctly graph-scoped through the journey-id set, empty map → empty heat;
  endpoint contract (admin guard 401/403 DB-untouched, 404 unknown map, envelope); the heat mapper unit
  (intensity scale from counts, drop-off flag) is pure — test without a DOM; the overlay-slot canvas +
  heat page render from mocked data + a graceful empty/failed state.
- **t-2** — `getModuleStats` dwell over seeded events: pairs each `module.entered` with the next
  `node_completed` for the user within the session gap, computes the median, caps/ignores unpaired
  entries, returns `null` at zero samples (no divide-by-zero); the StatsTab dwell card renders and
  degrades. Existing `getModuleStats` tests stay green (additive field).
- **t-3** — `module.completed`: all-`module`-node completion detection over a stateful in-memory fake
  (single-node reduces to node-complete; multi-node needs all), **idempotent** (a second qualifying
  `node_completed` does not re-emit — asserted), emitted **after** `applyEvent` (the pure engine
  untouched — asserted no engine edit); `module.status_changed` fires `runModuleWorkflowBindings` **only**
  when `status` changed and writes **no** `JourneyEvent` (mocked), isolated (dispatch throw swallowed);
  `session.started` (if included) fires only past the session gap. The erasure smoke still passes (new
  `type`s are ordinary `userId`-keyed rows on the cascade path).

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                   | Files (indicative)                                                                                                                                                                                                                                                                                                                              | Deps | Status        | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------- | --- |
| t-1 | **Collective heat/drop-off** — per-node cross-user aggregate over the stream + `GET …/maps/[slug]/heat` + a generic `overlay` slot on the journey canvas + a heat overlay (intensity + drop-off) + a map-scoped heat page + legend/toggle              | `lib/framework/engagement/map-heat.ts` (new), `app/api/v1/admin/framework/maps/[slug]/heat/route.ts` (new), `components/admin/framework/journey-explorer/journey-canvas.tsx` (+`overlay` slot), `components/admin/framework/map-heat/*` (new: heat mapper + node + page view), `app/admin/framework/maps/[slug]/heat/page.tsx` (new), `tests/…` | —    | **in flight** | —   |
| t-2 | **Dwell metric** — a sessionised `module.entered`→`node_completed` dwell on `getModuleStats` + a dwell stat card on the module Stats tab                                                                                                               | `lib/framework/engagement/stats.ts` (+`dwell`), `components/admin/framework/module-detail/stats-tab.tsx` (+card), `tests/…`                                                                                                                                                                                                                     | —    | **planned**   | —   |
| t-3 | **Deferred emit sites** — `module.completed` (all-nodes-complete, idempotent, from the transition caller — engine untouched) + `module.status_changed` (direct binding fire in `updateModuleSettings`, no `JourneyEvent`) + optional `session.started` | `lib/framework/engagement/vocabulary.ts` (+literals), `lib/framework/engagement/module-completion.ts` (new checker), the engine transition caller (edit), `lib/framework/modules/service.ts` (+status-change fire), `app/api/v1/framework/modules/[slug]/chat/stream/route.ts` (opt. `session.started`), `tests/…`                              | —    | **planned**   | —   |

**Three promoted PRs, mutually independent** (disjoint subsystems, no shared schema — decision A) → any
order / parallel after this claim PR. Each is a candidate split-at-build (t-1 on the API/UI seam; t-3
per emit site) if it exceeds the ~600-line budget ([[planning-retro#B25]]). No `framework_*` migration is
planned (decision E — an index only if a build-time scale finding warrants it).

### t-1 · Collective heat/drop-off overlay

- **Aggregate** — `getMapHeat(graphSlug, filter?)` (`engagement/map-heat.ts`): resolve the map's
  journey-id set (`UserJourney where graphSlug`), then `groupBy(['nodeKey','type'])` over `JourneyEvent
where journeyId in set` for `node_entered`/`node_completed`, plus a distinct-user count per node; fold
  into per-node `{ nodeKey, distinctUsers, entries, completions, dropOff }` where **drop-off** = entered
  users who never completed that node (`entries − completions`, or the distinct-user variant). Shaped to
  accept the same optional subject-scope filter the module stats carry (the #367 analytics axis — a later
  filter, not a rewrite). A9: derived from the stream, no counter.
- **Endpoint** — `GET /api/v1/admin/framework/maps/[slug]/heat` (`withAdminAuth`; 404 unknown map;
  automatic `proxy.ts` rate-limit). Returns the per-node heat array + the published structure hint the
  page needs (or the page fetches the map separately — decide at build).
- **Canvas overlay slot** — add a generic `overlay?: ReactNode` to `journey-canvas.tsx` (rendered as a
  React Flow `<Panel>` — the legend/toggle host), the **only** change to the shipped explorer canvas;
  the per-journey explorer keeps passing none (behaviour unchanged, asserted).
- **Heat surface** — a new `map-heat/` component set: run the pure `layoutJourney(publishedStructure)`
  for positions, fold each node's heat value into a heat node renderer (intensity scale + a drop-off
  badge), render on the canvas with a legend + a heat/drop-off toggle; a `/admin/framework/maps/[slug]/heat`
  page (thin server component: `serverFetch` the heat + map, empty/failed state, never throws — the
  modules-list precedent). Confirm the mount (a link from the map detail or a nav item) at build.
- **Done when:** an operator opens a map's heat view and sees per-node collective traffic + drop-off over
  the published structure, derived from the stream (no counter); the explorer canvas is unchanged for the
  per-journey case; aggregate + endpoint + mapper + page tests green; **gates green — `/pre-pr` →
  `/security-review` → `/code-review`** before the PR ([[planning-retro#B4]]).

### t-2 · Dwell metric

- **Query** — add `dwell: { medianMs: number; sampleCount: number } | null` to `ModuleStats`;
  `getModuleStats` pairs each `module.entered` with the same user's next `node_completed` (with the
  module's `moduleSlug`) within a session-gap cap (e.g. 30 min — a named constant), takes the elapsed
  deltas, returns the median (and sample count), `null` at zero samples. Same stream, same `Promise.all`
  batch; additive to the existing shape (existing tests stay green).
- **UI** — a **Dwell** stat card on `StatsTab` (formatted duration; a "—" / "no data" state at `null`).
  Presentational, no client hooks (the tab stays a server component).
- **Done when:** dwell is computed from the stream (sessionised, median, empty→null, no divide-by-zero)
  and rendered on the Stats tab; query + card tests green; existing `getModuleStats`/`StatsTab` tests
  green; **gates green** before the PR.

### t-3 · The deferred emit sites

- **`module.completed`** (decision C) — a `module-completion.ts` checker: given `(userId, moduleSlug,
journeyId)` after a `node_completed` commit, load the published map's `module`-nodes for the slug,
  intersect with the user's `node_completed` events, and if **newly** all-complete (no prior
  `module.completed` event for `(user, module)`), `void recordModuleEngagement({ type:
'module.completed', … })`. Called from the **transition caller** (the engine drain / `request-transition`
  path), **never inside `applyEvent`** — the pure engine stays untouched (F11). Idempotent by the
  prior-event guard.
- **`module.status_changed`** (decision D) — in `updateModuleSettings`, when the computed `changes`
  include `status`, `void runModuleWorkflowBindings(slug, 'module.status_changed', { from, to })`
  fire-and-forget, isolated (a dispatch failure never breaks the settings write). No `JourneyEvent`
  (operator action, no subject user).
- **`session.started`** (optional, decision D) — if included, emit from the surface chat route alongside
  `module.entered` when the user has no `JourneyEvent` within the session gap; `moduleSlug`/`journeyId`
  null. Drop if the PR runs hot.
- **Vocabulary** — add `moduleCompleted` (+ optional `sessionStarted`) to `ENGAGEMENT_EVENT_TYPE`;
  `module.status_changed` is a **binding-event** literal (no `JourneyEvent`), kept as a module-lifecycle
  constant, not an engagement-stream kind.
- **Done when:** `module.completed` fires once when every module node is complete for a user (idempotent,
  engine untouched), `module.status_changed` fires bindings on a status change with no `JourneyEvent`,
  and (if included) `session.started` respects the session gap; detection + isolation + idempotency tests
  green; erasure smoke green; **gates green** before the PR.

## Alternative shapes considered

- **Heat as an overlay mode on the per-journey explorer.** Rejected (decision B) — the explorer is
  journeyId-scoped (one user); collective heat is per-map (all users). Mixing them muddies both surfaces.
  A new map-scoped page reusing the pure `layoutJourney` is cleaner and leaves the explorer untouched.
- **Extract the shared read-only-canvas primitive now** (journey/map/atlas rule-of-three). Rejected for
  this feature — it's the standing cross-cutting follow-up touching three shipped canvases; this adds one
  additive `overlay` slot and defers the refactor to its own coordinated PR.
- **Put heat on the atlas.** Rejected (§recon 1) — atlas nodes are composition entities, not map nodes;
  per-node journey heat doesn't project onto them.
- **`module.completed` = a designated terminal node.** Rejected for v1 (decision C) — the map schema has
  no per-node terminal flag; adding one is a schema + editor change out of scope. All-nodes-complete is
  derivable today; promote to a terminal-node definition if/when the map gains the marker.
- **Emit `module.completed` from inside `applyEvent`.** Rejected — the pure engine stays LLM-free and
  binding-free (F11); the emit lives in the transition caller after commit.
- **A stored dwell counter.** Rejected — A9 (derive from the stream, never a counter); dwell is a
  sessionised fold over the same events.
- **Ship a `(journeyId, nodeKey)` index speculatively.** Rejected (decision E) — no evidence it's
  warranted at v1 scale; documented as a scale follow-up, added only on a build-time finding.

## Open questions — resolved inline (per [[planning-retro#B20]])

Resolved at plan time so a builder doesn't relitigate; re-confirm at build only if the code contradicts.

- **Where does collective heat live?** → a **new map-scoped `/maps/[slug]/heat` surface** reusing the
  pure `layoutJourney` + the journey-canvas's new `overlay` slot; not the per-journey explorer, not the
  atlas (decision B).
- **`module.completed` semantics** → **all `module`-type nodes for the slug in the published map
  completed** for the user (derived, no schema), emitted idempotently from the transition caller, engine
  untouched (decision C). _The one product call — the terminal-node refinement is deferred._
- **`module.status_changed` shape** → a **direct** `runModuleWorkflowBindings` fire in
  `updateModuleSettings` on a status change, **no `JourneyEvent`** (operator action, no subject user).
- **Drop-off definition** → per node, **entered-but-not-completed** users (`entries − completions`, or
  the distinct-user variant) over the map's journeys — derived from the stream, no new emit.
- **Dwell definition** → median elapsed from a `module.entered` to the same user's next module
  `node_completed` within a **session-gap cap**; `null` at zero samples.
- **`session.started`** → optional within t-3, coarse session-gap trigger from the surface route; the
  most negotiable emit, droppable if t-3 runs hot.
- **Subject-scope** → admin cross-user (`withAdminAuth`), the heat/dwell queries **shaped to accept a
  subject-scope filter** (the #367 axis) so owner/team/cohort views are a later filter, not a rewrite
  (mirrors `getModuleStats`).
- **Scale index** → not shipped speculatively; the `(journeyId, nodeKey)` index / `graphSlug`
  denormalisation is a documented follow-up on a build-time finding (decision E).

## Done when (feature)

An operator can: open a **map's collective heat view** and see per-node traffic + drop-off over the
published structure (all derived from the insert-only stream, no counters); read a module's **dwell**
alongside its other engagement stats; and rely on the framework firing **`module.completed`** when a
user finishes a module, **`module.status_changed` → bound workflows** when an operator changes a
module's lifecycle, and (optionally) **`session.started`** at a session boundary. All framework-tier,
all reusing shipped primitives, **no new table** — the pure engine stays untouched and the only possible
migration is a deferred scale index. **Deliberately out of scope:** the shared-canvas primitive
extraction, atlas heat, a stored dwell counter, per-owner subject-scoped views (seam shaped, not wired),
and a map terminal-node completion marker. Expected pure framework-tier — confirm per [[planning-retro#B17]]
at each task; ledger any upstream ask that surfaces.

## References

- [[plan#21 · `f-engagement-analytics` — the deferred observability layer|plan.md feature 21]] — parent.
- [[f-engagement]] — the stream + `getModuleStats` + `recordModuleEngagement` this extends; the dwell +
  heat + emit-site deferrals (Open-questions / does-NOT-do) this closes.
- [[f-ops-views]] — the journey explorer + `layoutJourney` + canvas this adds the overlay slot to;
  decision 1 (the host-first / overlay-plugs-in promise) this fulfils.
- [[f-atlas]] — the composition atlas (a considered-and-rejected heat host).
- [[f-module-bindings]] — `runModuleWorkflowBindings`, the receiver `module.status_changed` fires.
- [[f-engine]] / [[f-journey-state]] — the pure `applyEvent` (kept untouched) + the `JourneyEvent` stream.
- [[building-a-feature]] — the execution rhythm every task follows (claim-first docs PR → per-task gate
  loop → close-out).
- [[framework-architecture]] — §4.3 (stats & engagement) + A9 (stream, never counters) + X1 (free-form
  `type`) + §5.6 (journey views) + F11 (pure engine).
- [[planning-retro]] — B4 (gates as done-when), B9 (no live-DB tests), B13 (strip migration DROPs), B17
  (confirm pure-framework-tier at build), B20 (resolve open questions inline), B25 (size new-endpoint+UI
  at build), B28 (the graveyard pattern this feature drains).

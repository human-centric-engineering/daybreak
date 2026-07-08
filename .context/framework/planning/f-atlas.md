---
name: f-atlas
feature: 16 · f-atlas
epic: Framework v1
status: in flight (claimed 2026-07-07)
owner: Simon Holmes
depends_on: f-module-bindings ✅ + f-facilitation-agents ✅ + f-slots ✅ (the registries/pivots it projects) · reuses the shipped per-module + facilitation read queries (batch-stitch pattern), the read-only `@xyflow/react` canvas from f-ops-views (journey-explorer), and the existing agent/workflow/module admin editors as deep-link targets
spec: framework-architecture.md §5.6 (the framework atlas — zoomable composition view) · Appendix A — X8 (read-only, semantically-zoomable, pure projection, zero new schema, click-through-never-edit)
parent: plan.md
opened: 2026-07-07
planned: 2026-07-07
---

# f-atlas — the framework composition view

> Feature-level build plan for **`f-atlas`** (16). Parent: [[plan#16 · `f-atlas`|plan.md]].
> **Build-ready** — reconciled against repo reality (a three-way reconnaissance sweep of the composition
> data sources + the canonical batch-stitch pattern, the reusable read-only `@xyflow` canvas + semantic-
> zoom + deep-link targets, and the facilitation/slot/policy internals, 2026-07-07). Sizing: **3 PRs**
> (t-2 may split at build).

## Intent

The map editor and journey explorer show the _geography_ ("where does a user go?"); the atlas shows the
_composition_ ("what is the framework actually made of?") — one zoomable, read-only picture on the same
`@xyflow` canvas (spec §5.6, X8). It answers, at a glance, the questions that otherwise take four admin
pages: **"what is this module made of?"**, **"where else is this agent used?"**, **"who can write this
slot?"**

Three product outcomes:

1. **One composition graph** — a single read-only endpoint assembles the whole configuration (modules +
   their bound agents / workflows / slots / capabilities / knowledge grants, the facilitation layer +
   its role seats / policies / slots / framework capabilities, and the published map backbone) from the
   registries and binding pivots already maintained. **Zero new schema (X8)** — the atlas has no state
   of its own, so it _cannot drift from reality_.
2. **Semantic zoom** — zoomed out shows the map/modules; zoom into any module (or the facilitation node)
   and its composition unfolds as satellite nodes.
3. **Cross-cutting lenses + click-through** — invert the view (select an agent → every place it is
   bound; a slot group → every scope that owns it; a workflow → every binding that triggers it), and
   deep-link every node to its **real editor** — the atlas navigates, the dedicated editors edit
   (**never edit-in-place**, so no parallel mega-editor drifts from the real forms).

## Reconciliation with repo reality — the design decisions (settled 2026-07-07)

Organising principle: **pure read-only projection, zero schema**; **reuse the shipped readers + the
read-only canvas**; **navigate, never edit**; **degrade honestly where a target does not exist yet**;
**confirm "pure framework-tier" at build** ([[planning-retro#B17|B17]]).

1. **Every input already has a shipped reader using the canonical batch-stitch — the atlas assembles,
   it does not re-query raw.** The eight composition inputs and their readers:
   - **Modules** — `listModules()` ([`modules/queries.ts`](../../lib/framework/modules/queries.ts):23), with the code registry `getRegisteredModules()` ([`modules/registry.ts`](../../lib/framework/modules/registry.ts):36).
   - **Module→agent** — `listModuleBindings(slug)`
     ([`modules/bindings/queries.ts`](../../lib/framework/modules/bindings/queries.ts):52), stitches
     `AiAgent` (name/slug/isActive/**deletedAt** tombstone).
   - **Module→workflow** — `listModuleWorkflowBindings(slug)`
     ([`modules/workflow-bindings/queries.ts`](../../lib/framework/modules/workflow-bindings/queries.ts):39),
     stitches `AiWorkflow` (+ computed `hasPublishedVersion`).
   - **Module knowledge** — `listModuleKnowledge(slug)`
     ([`modules/knowledge/queries.ts`](../../lib/framework/modules/knowledge/queries.ts):36), stitches
     `AiKnowledgeDocument` + `KnowledgeTag`.
   - **Slot definitions** — `listSlotDefinitions()`
     ([`data-slots/queries.ts`](../../lib/framework/data-slots/queries.ts):20); `scope` declares
     ownership (`global` / `facilitation` / `module:<slug>`), with `visibility` + `sensitivity` markers.
   - **Capabilities** — module-declared (namespaced `<module>__<tool>`) from the registry + framework
     built-ins `getRegisteredFrameworkCapabilities()`
     ([`capabilities/registry.ts`](../../lib/framework/capabilities/registry.ts):41).
   - **Published maps** — `listGraphs()` ([`facilitation/map/queries.ts`](../../lib/framework/facilitation/map/queries.ts):19) and `getPublishedMap(slug)` ([`map/version-service.ts`](../../lib/framework/facilitation/map/version-service.ts):489); `MapDefinition` nodes of type `module` carry `moduleSlug`.
   - **Facilitation agents** — `listFacilitationBindings()`
     ([`facilitation/agents/binding-queries.ts`](../../lib/framework/facilitation/agents/binding-queries.ts):33)
     over the 6 `FACILITATION_ROLES` ([`agents/roles.ts`](../../lib/framework/facilitation/agents/roles.ts)).

   The **canonical batch-stitch** (collect ids → one `findMany where id in` → `Map` → stitch, `?? null`
   on a missing/tombstoned core row) is used by every stitching reader — the atlas assembler reuses it.

2. **The atlas builds ALL-MODULES aggregate readers, not per-module loops — because the lenses need the
   full cross-module set anyway.** The shipped binding readers are **per-module** (`listModuleBindings(slug)`
   etc.). Assembling the whole graph by looping them would be a fan-out, and the cross-cutting lenses
   ("where else is this agent used?") need every binding across every module in one place regardless. So
   t-1 adds **aggregate readers** (one `findMany` per pivot across all modules, then one batched core-row
   stitch, then group-by-module in memory) in a new `lib/framework/atlas/` module — reusing the exact
   batch-stitch shape, just widened from one module to all. **No new schema; only new read queries.**

3. **The endpoint returns a NORMALIZED projection (entities + relationships), not pre-laid-out nodes —
   the client mapper owns layout + `@xyflow` construction + semantic zoom.** Mirrors the shipped
   `journey-mapper.ts` split (pure-TS layout on the client over a server data projection). The wire
   shape is a typed `CompositionProjection { modules[], agents[], workflows[], slots[], capabilities[],
knowledge[], facilitation{seats,policies,slots,capabilities}, maps[], edges[] }` (ISO-string dates,
   the [[f-ops-views]] wire-type convention). Keeping the server a pure data projection makes the
   client-side lenses (filter/highlight) and semantic zoom natural, and keeps the endpoint honest
   (it cannot render a lie). **One endpoint, full projection in one call** — the config is bounded
   (modules/agents/slots are not large); lazy-load-on-unfold is a deferred follow-up if a deployment
   ever outgrows it.

4. **The facilitation layer is ONE node that unfolds into its internals** — distinct from modules by its
   deployment-wide, role-keyed identity (no parent entity; `scope = 'facilitation'`). Its satellites
   (from recon): the **6 role seats** → bound agents (`listFacilitationBindings`), the **enabled
   policies** by kind (`listEnabledFacilitationPolicies` over `FacilitationPolicy` kinds
   `auto_approval` / `relevance_gating` / `guard_minimum` / `escalation`
   — [`policies/kinds.ts`](../../lib/framework/facilitation/policies/kinds.ts):25), the **slots with
   `scope='facilitation'`**, and the **7 framework capabilities** (`get_state`, `fill_slot`,
   `get_journey_state`, `get_next_steps`, `get_progress_synopsis`, `suggest_focus`, `request_transition`).

5. **Reuse the read-only `@xyflow` canvas from f-ops-views; the atlas adds three things it lacks.** The
   journey-explorer canvas ([`journey-explorer/journey-canvas.tsx`](../../components/admin/framework/journey-explorer/journey-canvas.tsx))
   gives the read-only config verbatim (`nodesDraggable`/`nodesConnectable`/`elementsSelectable` =
   false, `Background`/`Controls`/`MiniMap`, dark-mode via `useTheme`, `MarkerType.ArrowClosed`) and the
   pure-TS mapper pattern (`journey-mapper.ts`). **New for the atlas** (none exist in the repo): (a)
   **multiple node types** (map-region, map-place, module, facilitation, agent, workflow, slot-group,
   capability, knowledge) via the `nodeTypes` factory the workflow-builder uses; (b) **`@xyflow` v12
   native parent/child container nodes** for regions + a module's satellite cluster (the workflow
   builder is a flat DAG — no group-node precedent); (c) **semantic zoom** — read current zoom via
   `useStore((s) => s.zoom)` / `useOnViewportChange` (v12.11.2) to unfold satellites past a threshold
   (no existing pattern — the atlas introduces it).

6. **Deep-link to the real editors; degrade honestly where none exists.** Confirmed targets: **agent**
   → `/admin/orchestration/agents/[id]`, **workflow** → `/admin/orchestration/workflows/[id]`,
   **module** → `/admin/framework/modules/[slug]` (the tabbed detail from [[f-ops-views]]), and — **new
   since this plan was written** — **map** → `/admin/framework/maps/[slug]` (`f-map-editor` (14) t-1
   #110 landed the maps route mid-build, so the map deep-link is **wired, not degraded**). Capability /
   knowledge land on their **list** admin pages (`/admin/orchestration/{capabilities,knowledge}`); a
   **slot** and the **facilitation** layer have no editor yet, so they degrade to an honest non-link (a
   node with `href: null`). (Deep-links are a thin layer — folded into t-2a per [[planning-retro#B1|B1]],
   not their own PR.)

7. **Cross-cutting lenses are a client-side inversion over the one projection (their own task).** Given
   the full `CompositionProjection` on the client, a lens is a pure filter/highlight: select an **agent**
   → highlight every module role + facilitation seat binding it; a **slot group** → the scopes that own
   it + (via `getSlotGroupsScopes`) the agents exposed to it; a **workflow** → every module binding whose
   `eventType` triggers it. This is a distinct interaction layer (a lens selector + highlight/dim/focus
   state) substantial enough to be **t-3**, not folded into the base canvas.

8. **Expected pure framework-tier — zero new schema, no migration, no CHANGELOG (X8; confirm at build,
   [[planning-retro#B17|B17]]).** The endpoint only _reads_ (framework rows + core `AiAgent`/`AiWorkflow`/
   `AiKnowledgeDocument`/`KnowledgeTag` display fields via the same batch-stitch the shipped readers
   already use — no core edit), the canvas is framework admin UI, and deep-links navigate to existing
   routes. Paths (`app/api/v1/admin/framework/atlas/**`, `components/admin/framework/atlas/**`) are
   already inside the shipped framework boundary allowlists (ESLint glob + `isCoreSource`) — no new
   path-kind, so **no two-allowlist sync needed** (contrast the t-5b gap).

## Tasks (promoted)

| ID   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Files (indicative)                                                                                                                                                                       | Deps | Status   | PR   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- | ---- |
| t-1  | **The composition-graph read endpoint (anchor).** All-modules aggregate readers (one query per pivot across all modules + one batched core-row stitch each, reusing the canonical batch-stitch) + the facilitation-layer assembler + the published-map projection, composed into a typed `CompositionProjection` (normalized entities + edges, ISO-string dates); `GET /api/v1/admin/framework/atlas` (`withAdminAuth`). Pure server, unit-testable with a prisma mock; assert the projection shape **and** no-N+1 (one query per entity type).                                                                                                                                     | `lib/framework/atlas/{queries,assemble,view}.ts`, `app/api/v1/admin/framework/atlas/route.ts`, `tests/…`                                                                                 | —    | **done** | #104 |
| t-2a | **The static read-only composition canvas + deep-links.** The `@xyflow` multi-type node canvas (reusing the journey-explorer read-only config + the map editor's node-kind registry pattern) + the pure-TS composition mapper (`compositionToFlow`: hub-and-spoke layout — primaries on a row, satellites stacked under their first owner; `map_module` edges collapse to `map→module`) + one type-driven `AtlasNode` + node-kind registry + **click-through deep-links** (agent/workflow/module/**map** editors — 14's maps route now exists; capability/knowledge → list pages; slot/facilitation degrade). Nav "Atlas" item + thin server page + legend. No zoom/containers yet. | `components/admin/framework/atlas/{atlas-view,atlas-canvas,atlas-mapper,atlas-node,atlas-node-kinds}.tsx`, `app/admin/framework/atlas/page.tsx`, `lib/framework/admin-nav.ts`, `tests/…` | t-1  | **done** | #113 |
| t-2b | **Semantic zoom** (region containers deferred). Unfold a primary's satellites past a zoom threshold and collapse below it — via `useViewport().zoom` + the pure `applyDetail` (sets React Flow `hidden`, never drops nodes) — plus a manual "Show all detail" override toggle. **Scoped at build to zoom-driven semantic zoom only; `@xyflow` v12 parent/child region-container nodes (collapse/expand) deferred** to a follow-up — parent-node layout is a separate fiddly piece and zoom-driven detail is the spec's core "zoom in and composition unfolds" (§5.6).                                                                                                               | `components/admin/framework/atlas/{atlas-detail.ts,atlas-graph,atlas-view}.tsx`, `tests/…`                                                                                               | t-2a | **done** | #___ |
| t-3  | **Cross-cutting lenses.** The agent / slot-group / workflow-centric inversions as a client-side filter/highlight over the one projection (select an entity → focus every place it participates; dim the rest), a lens selector, and the focus/clear interaction.                                                                                                                                                                                                                                                                                                                                                                                                                    | `components/admin/framework/atlas/{lenses,atlas-view}.tsx`, `lib/framework/atlas/lens.ts` (pure filter helpers), `tests/…`                                                               | t-2a | **todo** | —    |

**Sizing (B1 / B25): 3 PRs (may become 4).** Re-cut from the board's three by _machinery_: the board's
"deep-links" is a sliver folded into t-2 (B1); the board's "canvas + lenses" is split into the **base
canvas** (t-2) and the **lenses** (t-3), because the semantic-zoom multi-type canvas is the heavy piece
and the inversions are a distinct interaction layer. t-1 (the pure-server projection, 8 sources) is
cleanly separable and unit-testable. **t-2 is the largest** (multi-type nodes + parent/child containers

- semantic zoom + deep-links, all new patterns); if it exceeds the ~600-line budget at build, split along
  the cleanest seam — **t-2a** (static composition render + node types + deep-links) · **t-2b** (semantic-
  zoom unfold + region container nodes) — the same build-time split f-ops-views t-4 / f-overlays t-3 took.

## Per-task "Done when"

- **t-1** — `GET …/atlas` returns a `CompositionProjection` covering all eight inputs (modules + their
  agents/workflows/slots/capabilities/knowledge, the facilitation node, the published map(s)); the
  aggregate readers issue **one query per pivot + one batched stitch per core type** (a test asserts no
  per-module fan-out); missing/tombstoned core rows degrade to `null`, never crash; `withAdminAuth`; an
  empty deployment (no modules/bindings) returns a valid empty-ish projection; full gate loop green.
- **t-2** — the canvas renders the projection read-only (no drag/connect/select) with the map/module/
  facilitation nodes and their satellites; semantic zoom unfolds a module's/facilitation's satellites
  past the threshold and collapses them below it; every agent/workflow/module node deep-links to its real
  editor, and a map/slot node shows the honest "no editor yet" affordance (not a dead link); the mapper
  is unit-tested as pure TS (layout + node/edge construction), the canvas with a mocked `@xyflow` (as the
  journey-canvas tests do); per-file coverage ≥80%; full gate loop green.
- **t-3** — selecting an agent focuses every module role + facilitation seat it is bound into (others
  dimmed) and clears cleanly; the slot-group and workflow lenses invert correctly; the lens filters are
  pure functions, unit-tested independently of the canvas; the lenses never mutate the projection or
  enable editing; full gate loop green.

Every task inherits the repo rules ([[CLAUDE|CLAUDE.md]]): `logger` not `console`; `@/` imports; Zod at
boundaries; `withAdminAuth` on the read route (rate-limiting automatic via `proxy.ts`); **no new `User`
relation, no new model, no migration** (X8 — pure projection); build in `lib/framework/` + the framework
admin surface only (boundary CI, already-allowlisted paths). **Read-only, navigate-never-edit** is the
load-bearing invariant of the whole feature — a test should assert the canvas exposes no edit/mutation
affordance.

## Open questions — genuinely the owner's (flagged, not parked)

- **Map anchoring — one selected graph, all graphs, or module-first?** There may be several published
  graphs (`listGraphs`). _Default:_ **module/facilitation-composition-first** (the registries are the
  primary picture), with a **graph selector** to anchor the published-map backbone when one is chosen —
  the atlas's job is composition, and the map _geography_ is f-map-editor's (14). Owner to confirm vs.
  "render the full map topology as the zoomed-out base" (heavier, and duplicates 14/the explorer).
- **Semantic-zoom thresholds + default detail.** _Default:_ zoomed-out = map/module/facilitation nodes
  only; unfold a node's satellites past a zoom level (or on click-to-focus). Exact thresholds tuned at
  build; owner may prefer click-to-expand over pure zoom-driven.
- **Slot / facilitation deep-link targets.** No dedicated slot editor exists; the facilitation-agents
  admin surface may or may not have a page. _Default:_ slot nodes deep-link to their **owning module**
  (config tab) where a module scope, else the honest non-link state; facilitation node → the facilitation
  admin page if one exists, else non-link. Owner to confirm.
- **Projection size / lazy-load.** _Default:_ one endpoint, full projection (bounded config). If a
  deployment's config grows large, lazy-load module internals on unfold is a follow-up — recorded, not
  built.

## What this feature deliberately does NOT do

- **It adds no schema and no state (X8).** Every node/edge is derived from existing registries/pivots +
  the published map; the atlas cannot disagree with reality because it stores nothing.
- **It never edits.** Every node deep-links to its real editor; the canvas is strictly read-only. No
  edit-in-place, no parallel mega-editor.
- **It does not build the map editor.** Map nodes degrade to a non-link state until `f-map-editor` (14)
  ships; wiring that deep-link is then a one-line add.
- **It does not render engagement overlays.** The engagement-heat / journey-replay overlay toggles (spec
  §5.6) are `f-engagement` (08)'s, landing on this same canvas later — the atlas leaves the seam, does
  not build them.

## Follow-ups (recorded so they have a home — [[deferrals-need-a-home]])

- **Map-node deep-link** — ~~wire to the map editor when `f-map-editor` (14) ships~~ **done in t-2a**:
  14's t-1 (#110) landed `/admin/framework/maps/[slug]` mid-build, so the atlas wires it directly.
- **Engagement overlay toggles** — `f-engagement` (08)'s heat/replay overlays on the atlas canvas (a
  future cross-feature integration; 08 owns the overlay data).
- **Lazy-load on unfold** — if a deployment outgrows the single full-projection call (open question 4).
- **Region-container nodes** (t-2b scoping) — `@xyflow` v12 native parent/child container nodes for
  map regions + per-module satellite clusters (visual grouping + collapse/expand). Deferred from t-2b
  (which shipped zoom-driven semantic zoom); parent-node layout is its own fiddly piece, additive on
  the shipped canvas.
- **Shared read-only canvas decorations** (t-2a `/code-review`) — the `<Background>`/`<Controls>`/
  `<MiniMap>` config + `useTheme`/`colorMode`/`defaultEdgeOptions`/`proOptions` boilerplate now recurs
  across THREE framework canvases (journey-explorer, map-builder, atlas — rule-of-three met). Extracting
  the shared decorations (e.g. `components/admin/framework/canvas/`) is worthwhile, but it refactors two
  **shipped** canvases (one just merged in #110), so it belongs in its own coordinated PR, not the atlas
  anchor. Keep the per-canvas interaction flags + `nodeTypes` local.
- **Shared `stitchAgents` / `stitchById` helper** (t-1 `/code-review`) — the collect-ids →
  `findMany where id in` → `Map` → `?? null` batch-stitch now recurs across the atlas aggregate
  readers and the shipped per-module + facilitation readers (agent-stitch is byte-identical in ≥4
  sites). A shared helper in `lib/framework/shared/` is the rule-of-three extraction; deferred out of
  t-1 because it touches shipped readers (`modules/bindings`, `facilitation/agents/binding-queries`)
  and belongs in its own refactor, not the atlas anchor PR.

## Reference

- [[f-ops-views]] — the read-only `@xyflow` journey-explorer canvas + the wire-type convention + the
  module/agent/workflow admin editors this deep-links into.
- [[f-module-bindings]] · [[f-facilitation-agents]] · [[f-slots]] — the registries/pivots/roles the atlas
  projects; their shipped readers + the canonical batch-stitch.
- [[building-a-feature]] — the execution rhythm (claim-first docs PR → per-task gate loop → close-out).
- [[framework-architecture]] — §5.6 (the atlas), X8 (read-only, pure projection, zero schema,
  click-through-never-edit).
- [[planning-retro]] — B1 (fold slivers — deep-links into t-2), B17 (confirm pure-framework-tier at
  build), B25 (endpoint+UI sizing, split at build).

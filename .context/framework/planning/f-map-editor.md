---
name: f-map-editor
feature: 14 · f-map-editor
epic: Framework v1
status: in flight (deps f-map + f-engine shipped ✅) — planned, tasks promoted
owner: John
depends_on: f-map (shipped — the map schema + version service + admin API this drives) · f-engine (shipped — the pure `computeAvailability`/`rankMoves` the dry-run runs) · reuses the core workflow-builder's editable-canvas shell (pattern) + the f-ops-views journey-explorer's `layoutJourney` mapper (`@xyflow/react` v12)
spec: framework-architecture.md §5.6 (admin experience — map editor + dry-run) · Appendix A — F18 (journey dry-run simulator; engine purity makes it nearly free)
parent: plan.md
opened: 2026-07-08
planned: 2026-07-08
---

# f-map-editor — map editor + dry-run simulator

> Feature-level build plan for **`f-map-editor`** (14). Parent: [[plan#14 · `f-map-editor`|plan.md]].
> Binding _how_: [[framework-architecture#5.6 Admin experience|§5.6]] (the map editor is the workflow
> builder's canvas re-instantiated with facilitation node/edge types + region collapse/expand + a
> per-node config panel + publish/rollback controls) and **F18** (the dry-run: engine purity lets an
> admin simulate a synthetic user against a _draft_ map). **Build-ready** — reconciled against repo
> reality by a three-sweep reconnaissance (the shipped map backend + schema; engine/guidance purity for
> the dry-run; the workflow-builder + journey-explorer UI reuse surfaces, 2026-07-08). Sizing: **task =
> one PR** (~200–600 lines), **5 PRs**.

## Intent

Give an author a **canvas to build a facilitation map** — drop nodes, draw typed edges, group nodes into
collapsible regions, configure each node's gating/binding, see validation errors before publishing, and
manage versions (publish / rollback / history) — plus a **journey dry-run simulator** (F18): "given
these completions, these slot values, and this clock, what's available on this _draft_ map, what's locked
and _why_, and what would guidance rank first?" — answered before publishing, with **zero writes**.

## The pivotal finding — the map backend is already shipped; this is a UI feature (+ one endpoint)

`f-map` shipped the **entire** authoring backend, API-first, and this feature is its UI (the same
read-API-here / UI-there split 03/06/07 made). Every verb the editor needs exists:

- **Load** a map + its draft — `GET /maps/[slug]` (`getGraphDetail` returns the row incl.
  `draftDefinition` + `publishedVersion`).
- **Save** the edited draft — `PATCH /maps/[slug]` with `{ definition }` (`saveDraft`, which
  **deliberately skips publish validation** so a half-built map saves); `{ definition: null }` discards.
- **Publish** — `POST /maps/[slug]/publish` (gated on `validatePublishableMap` ⇒ **400 with structured,
  path-tagged errors** the editor surfaces).
- **Rollback / history** — `POST /maps/[slug]/rollback` + `GET /maps/[slug]/versions`.

The publish validators — `validateMapFormat` (referential integrity) and `validateGraphInvariants`
(prerequisite cycles / unreachable nodes) — are **pure, DB-free, and callable standalone**, so the editor
runs them as a **live preflight** (inline error rings) without a round-trip. **The only new backend is the
dry-run endpoint** (decision 4). Everything else is `components/admin/framework/**` +
`app/admin/framework/maps/**` — **expected pure framework-tier, no migration, no core edit** (the map
schema's free-form `meta` bag absorbs canvas layout; confirm per [[planning-retro#B17|B17]] at build).

## Reconciliation with repo reality — the design decisions (settled 2026-07-08)

Organising principle: **reuse the shipped backend + the editable-canvas machinery that already exists**;
**correct the board's canvas-reuse framing to what the recon actually found**; **ship nothing a fork
deletes**; **confirm pure-framework-tier at build** ([[planning-retro#B17|B17]], [[planning-retro#B27|B27]]:
this feature's spine is UI over dormant-but-shipped backend, not new plumbing).

1. **The editor forks the core _workflow-builder's_ editable shell — not the read-only journey canvas.**
   f-ops-views t-5b built a **read-only** `@xyflow` journey canvas (drag/connect/select disabled), so it
   is not an editing base. The **workflow-builder**
   ([`components/admin/orchestration/workflow-builder/`](../../components/admin/orchestration/workflow-builder/))
   is a **fully editable** canvas whose _shell_ is exactly what the map editor needs: `useNodesState`/
   `useEdgesState`, `onConnect` edge-drawing, palette drag-drop (`screenToFlowPosition`), a per-node
   config aside, live-validation → per-node error ring, and **save / publish / discard / rollback
   handlers that map 1:1 onto the shipped map version-service verbs**. It is workflow-bound only at the
   _leaves_ (the step registry, `PatternNode`, the 16 block-editors, `workflow-mappers`). So the editor is
   a **new framework-tier `map-builder/` component tree modeled on that shell** (a pattern-fork, not an
   import — the workflow leaves can't carry the map vocabulary), swapping the leaves for: a **map
   node-type registry** (4 types: `module`/`stage`/`milestone`/`region`), a `MapNode` component (cribbed
   from the journey-explorer's vocabulary-aware `journey-node.tsx`), **4 typed-edge** components, map
   config editors, and **map↔ReactFlow mappers**. _(A generic editable-canvas shell that both workflow +
   map share would be the DRY win, but that's a **Sunrise-core refactor** — ledgered as a fork-first
   upstream-ask, not built here.)_

2. **Auto-layout reuses the journey-explorer's `layoutJourney`; authored positions persist in node
   `meta`.** Maps store **no x/y** ([`map/schema.ts`](../../lib/framework/facilitation/map/schema.ts) —
   `meta` is the only free-form bag). The journey-explorer's `layoutJourney`
   ([`journey-explorer/journey-mapper.ts`](../../components/admin/framework/journey-explorer/journey-mapper.ts))
   is a **Kahn longest-path** layout that consumes `MapDefinition` directly (its layout half is
   journey-status-agnostic) — reuse it as the editor's **"tidy"/auto-layout** and to seed positions for
   unpositioned nodes. The editor **persists a node's canvas position in a reserved `meta._layout`
   `{ x, y }`** — schema-compatible (`meta` is `z.record`), **no migration**, mirroring the
   workflow-builder's `config._layout` convention. Bonus: a published version snapshots its layout, so the
   explorer/atlas can render the authored arrangement instead of always recomputing.

3. **Validation is a live client preflight over the pure validators + the publish 400.** The editor calls
   `validateMapFormat` / `validateGraphInvariants` (pure, path-tagged error codes —
   `DUPLICATE_NODE_KEY`, `DANGLING_EDGE_ENDPOINT`, `REGION_CYCLE`, `PREREQUISITE_CYCLE`, `UNREACHABLE_NODE`,
   …) to ring offending nodes/edges as the author works, and surfaces the **publish endpoint's 400**
   (`{ definition: string[] }`) as the authoritative gate. The non-blocking **live-key-removal warning**
   (`checkLiveKeyImpact`, needs journey-state I/O) is a _publish-time warning_ — surface it if cheap, else
   a documented follow-up.

4. **The dry-run (F18) is a thin new server endpoint over the pure engine — the only new backend.** The
   engine was **built for this**: `availability.ts`'s header names F18 as why it stays pure, and
   `computeAvailability` + `rankMoves` are pure functions over an in-memory `AvailabilityInput`
   (a `GraphStore`, synthetic `nodeStates`, `slots`, `moduleLiveness`, and a `now` clock) — **zero DB**.
   So ship **`POST /maps/[slug]/dry-run`** (`withAdminAuth`): body = the **current editor `definition`**
   (so an author simulates _unsaved_ edits) + synthetic `{ completions, slots, now }`; the handler parses
   the definition, builds `inMemoryGraphStore(definition)` (**not** `getPublishedGraph`), constructs the
   synthetic input, runs `computeAvailability` then `rankMoves`, and returns per-node verdicts
   (available + every `lockReason`) + the ranked moves (with reasons). Keeps engine internals server-side
   (no framework-engine client bundle). **Never** calls `applyEvent` (the writer) or `loadGuidance` (the
   DB-bound orchestrator). A malformed definition returns the validation errors, not a crash.

5. **Region collapse/expand is the one genuinely-new canvas integration — `@xyflow` v12 parent/child.**
   A region is a `type:'region'` node; members carry `region: <regionKey>`. Render regions as v12 **group
   nodes** (`parentId` + `extent:'parent'`), collapse = hide children + shrink the group. Nothing in the
   repo uses xyflow parent/child yet, so this is net-new (its own task, t-2). Fallback if parent/child
   proves fiddly at build: a non-interactive visual grouping (background hull) without true collapse —
   flagged, not silently dropped.

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                                                                                                                         | Files (indicative)                                                                                                                                                                                            | Deps | Status  | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------- | --- |
| t-1 | **Canvas foundation + draft load/save (anchor).** The `maps` list + `maps/[slug]` editor pages + the "Maps" nav item; the `<MapBuilder>` client island (fork the workflow-builder shell); map↔ReactFlow **mappers** with `meta._layout` persistence + `layoutJourney` auto-layout; the `MapNode` component + node-type **palette** (4 types); node create/drag/delete; **save-draft** via `PATCH` + discard. | `app/admin/framework/maps/{page,[slug]/page}.tsx`, `lib/framework/admin-nav.ts` (add Maps), `components/admin/framework/map-builder/{map-builder,map-canvas,map-palette,map-node,map-mappers}.tsx`, `tests/…` | —    | backlog | —   |
| t-2 | **Typed edges + region containers.** The 4 typed-edge components (`prerequisite`/`unlocks`/`tangent`/`related_to`) + drawing on `onConnect`; the edge inspector (type + condition); **region collapse/expand** via `@xyflow` v12 parent/child (decision 5).                                                                                                                                                  | `components/admin/framework/map-builder/{map-edges,edge-inspector,region-group}.tsx`, `map-mappers.tsx` (regions↔parent/child), `tests/…`                                                                     | t-1  | backlog | —   |
| t-3 | **Node config inspector + live validation surfacing.** The per-node config panel — node type, module binding (`moduleSlug` picker), `onFirstArrival` (workflow/agent), `completionMode` — and the **gating-condition builder** for the 3 families (`state`/`slot`/`temporal`), descriptor-driven; live preflight (pure `validateMapFormat`/`validateGraphInvariants`) → error rings + an errors panel.       | `components/admin/framework/map-builder/{node-inspector,condition-builder,validation-panel}.tsx`, `tests/…`                                                                                                   | t-1  | backlog | —   |
| t-4 | **Version controls.** Publish (pre-publish validation gate + `changeSummary`), version-history list, rollback, discard-draft — the version UX over the shipped `publish`/`rollback`/`versions` endpoints (ports near-verbatim from the workflow-builder's publish/history/revert handlers).                                                                                                                  | `components/admin/framework/map-builder/{publish-controls,version-history}.tsx`, `tests/…`                                                                                                                    | t-1  | backlog | —   |
| t-5 | **Journey dry-run simulator (F18).** `POST /maps/[slug]/dry-run` (pure `computeAvailability` + `rankMoves` over the body definition + synthetic `{ completions, slots, now }`, zero DB) + the simulator panel (synthetic inputs → available/locked/**why** per node, guidance ranking). The "nearly free" payoff of engine purity.                                                                           | `app/api/v1/admin/framework/maps/[slug]/dry-run/route.ts`, `lib/framework/facilitation/dry-run.ts` (synthetic-input adapter), `components/admin/framework/map-builder/simulator-panel.tsx`, `tests/…`         | t-1  | backlog | —   |

**Sizing (B1): 5 PRs.** The board's ~5 holds — its indicative t-1 ("confirm primitives + reuse seam") was
_recon_, now folded into this plan, and the build splits along editable-canvas concerns. **t-1 is the
anchor** (the editable canvas that loads + saves a draft — everything else mounts on it). **t-2 (regions)
is the highest-risk-new** (first `@xyflow` parent/child use). **t-3 (the condition builder over 3 families)
is the most intricate**; if it exceeds the budget, split the condition builder from the node inspector.
**t-4 ports cheaply** from the workflow-builder. **t-5 is thin** (a pure endpoint + a panel). t-2–t-5 all
depend on t-1's canvas + mappers; t-2/t-3/t-4 are mutually independent (edges/regions vs node-config vs
version-controls), t-5 needs only t-1.

## Per-task "Done when"

- **t-1** — the `maps` list + `maps/[slug]` editor render under a new "Maps" nav item; `<MapBuilder>`
  loads a draft (`GET`), renders it editable (`@xyflow`, auto-laid-out via `layoutJourney`, positions
  read from `meta._layout` when present), lets an author add/drag/delete nodes from the palette, and
  **saves the draft** (`PATCH { definition }`) with positions round-tripped through `meta._layout`;
  discard clears the draft; **pure framework-tier confirmed** (no core edit, no migration); full gate loop.
- **t-2** — an author draws each of the 4 typed edges (`onConnect` → a typed edge, editable in the
  inspector) and groups nodes into a **region that collapses/expands** (xyflow parent/child); the mappers
  round-trip edges + region membership (`node.region`) to/from `MapDefinition`; full gate loop.
- **t-3** — the node inspector edits type / module binding / first-arrival / completion mode, and the
  **condition builder** composes a valid `state`/`slot`/`temporal` condition (the `z.discriminatedUnion`
  shape) on a node/edge; the live preflight rings the nodes/edges the pure validators flag (each error
  code) and lists them; full gate loop.
- **t-4** — publish surfaces the **validation 400** on an invalid draft and succeeds on a valid one
  (new version pinned); the version-history list + rollback + discard drive the shipped endpoints; full
  gate loop.
- **t-5** — `POST …/dry-run` returns per-node availability + every `lockReason` + the ranked moves for a
  body `{ definition, completions, slots, now }`, **writes nothing** (a test asserts no `applyEvent`/DB
  write and that a synthetic `now` + slots flow through), and returns validation errors for a malformed
  definition; the panel drives it (set completions/slots/clock → see available/locked/why + ranking);
  full gate loop.

Every task inherits the repo rules ([[CLAUDE|CLAUDE.md]]): `logger` not `console`; `@/` imports (never
relative, even for sibling `map-builder/` files); Zod at the dry-run boundary; `withAdminAuth` on the
dry-run route (rate-limit automatic via `proxy.ts`); **every non-trivial config field gets a `<FieldHelp>`
ⓘ** (the node inspector + condition builder are form-dense — [`contextual-help`](../../.context/ui/contextual-help.md));
a list/table page gets its data from one enriched fetch (no per-row `useEffect` fetches); build in
`components/admin/framework/**` + `app/admin/framework/maps/**` + the one framework API route (boundary CI).

## Open questions — genuinely the owner's (flagged, not parked)

- **Editor base.** Default (decision 1): **fork the workflow-builder shell** into a framework-tier
  `map-builder/` tree. Alternative — extract a **shared generic editable-canvas** both workflow + map use —
  is the DRY ideal but a **Sunrise-core refactor**; ledger it as a fork-first upstream-ask, don't gate on
  it. _Default: fork the pattern; file the upstream observation._
- **Layout persistence.** Default (decision 2): persist canvas x/y in **`meta._layout`** (no migration);
  auto-layout (`layoutJourney`) seeds unpositioned nodes. Alternative: auto-layout only (never persist) —
  simpler, but an author's arrangement is lost each reload. _Default: persist in `meta`._
- **Dry-run subject.** Default (decision 4): the endpoint simulates the **in-editor `definition`** carried
  in the body (so unsaved edits are testable). Alternative: only the saved draft. _Default: body-carried._
- **Typed-edge drawing UX.** Default: `onConnect` creates a **default `prerequisite` edge**, retyped +
  conditioned in the edge inspector (t-2). Alternatives: a palette "edge tool" (pick type, then draw) or an
  on-connect type picker. _Default: draw-then-inspect._
- **Region collapse/expand.** Default (decision 5): **`@xyflow` v12 parent/child**. Fallback if fiddly: a
  non-interactive visual grouping without true collapse. _Owner to confirm at t-2 build._
- **Live-key-removal warning at publish.** Default: surface `checkLiveKeyImpact` as a **non-blocking
  warning** if cheap; else a documented follow-up. _Default: best-effort warning._

## What this feature deliberately does NOT do

- **It adds no map backend.** Create / save-draft / discard / publish / rollback / versions + the
  validators all shipped in `f-map`; the editor drives them. The **only** new server code is the dry-run
  endpoint + its synthetic-input adapter.
- **It changes no schema.** Canvas layout lives in the existing free-form `meta` bag (`meta._layout`) —
  no migration, no new column.
- **It is not the atlas.** `f-atlas` (16, Simon) is the read-only _composition_ view; this is the
  _geography_ editor. The two share the `@xyflow` map-rendering vocabulary (a coordination point, not a
  dependency) — the atlas can later reuse this feature's `MapNode` + `meta._layout` rendering.
- **The dry-run never writes.** It exercises the pure `computeAvailability`/`rankMoves` only; it never
  touches `applyEvent`, journey state, or the DB.

## Reference

- [[f-map]] — shipped the map schema + version service + admin API this editor drives.
- [[f-engine]] — shipped the pure `computeAvailability` / `rankMoves` (+ `inMemoryGraphStore`) the dry-run runs.
- [[f-ops-views]] — shipped the read-only journey explorer (the `layoutJourney` mapper + vocabulary-aware node this reuses) + the framework admin nav seam.
- [[f-atlas]] — the read-only composition view (16, Simon); shares the map-rendering vocabulary (coordination, not a dep).
- [[building-a-feature]] — the execution rhythm (claim-first docs PR → per-task gate loop → close-out).
- [[framework-architecture]] — §5.6 (map editor + dry-run) + F18 (dry-run is nearly free on a pure engine).
- [[planning-retro]] — B17 (confirm pure-framework-tier at build), B25 (size a UI task by the machinery it writes), B27 (a UI-over-shipped-backend feature's spine is the reuse, not new plumbing).

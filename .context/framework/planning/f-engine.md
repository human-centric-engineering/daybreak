---
name: f-engine
feature: 11 · f-engine
epic: Framework v1
status: shipped (t-1 #34 · t-2 #36 · t-3 #37 · t-4 #38)
owner: John
depends_on: f-map (shipped — #16 / #20 / #21, for the published-map format + the publish-validation chain the engine extends) · f-journey-state (shipped — #27 / #28, for the state tables the engine writes + the `canRead` seam + `NODE_STATE_STATUS`)
spec: framework-architecture.md §5.1 (map + GraphStore) · §5.3 (the deterministic engine) · §4.1 (module liveness) · §5.5 (self-generation / proposal pipeline) · §C7 (timezone-resolved `now`) + Appendix A (F2 / F3 / F4 / F5 / F6 / F7 / F8 / F9 / F10 / F11 / F12 / F17 / F18 / F19 / A5 / X1 / X2 / X3 / X6)
parent: plan.md
opened: 2026-07-05
---

# f-engine — deterministic facilitation engine + GraphStore

> Feature-level build plan for **`f-engine`**, the deterministic spine of the facilitation
> subsystem (spec §5.3): pure, LLM-free, and the **sole writer** of journey state (F11).
> Parent: [[plan#11 · `f-engine` — deterministic engine + GraphStore|plan.md]].
> Binding _how_: [[framework-architecture#5.3 The engine — deterministic core|§5.3]] (the engine),
> [[framework-architecture#5.1 The map — authored structure|§5.1]] (map + GraphStore), and the
> Appendix A decisions — **F8** (GraphStore interface, Postgres now / swap later), **F3** (four edge
> types, fixed semantics), **F4** (family-tagged declarative conditions; `now` is a pure input),
> **F6** (once/repeatable), **F10** (event log is source of truth, projection materialised), **F11**
> (sole writer; structured rejections), **F9** (pgvector advisory-only — out of eligibility), **F17**
> (one proposal pipeline; the engine's invariant check is the shared stage), **A5** (module liveness
> is intersected, not recomputed), **X1/X2/X3/X6** (free-string columns · `canRead` · `contextKey`
> sentinel · the boundary). Sizing follows the parent plan: **task = one PR** (~200–600 lines).

## Intent

Build the **deterministic core** (spec §5.3) that turns the authored map (`f-map`) + per-user state
(`f-journey-state`) into an explainable "what is possible now, and what may I do next" — and the
**one validated write path** (`applyEvent`) that is the only thing in the system permitted to mutate
journey state (F11). Everything probabilistic — guidance ranking, agent narration — reads _from_ this
spine and never writes _to_ it except by requesting a transition the engine validates and applies.

Four capabilities: a **`GraphStore`** over the published map (topology: reachability, neighbours,
paths — F8); **`computeAvailability`**, the pure function that evaluates typed edges + declarative
conditions against state, slots and a resolved `now`, intersected with module liveness, returning the
complete explainable picture (§5.3); **`applyEvent`**, the sole writer that validates a requested
transition, applies once/repeatable semantics, and appends the immutable `JourneyEvent` + updates the
`UserNodeState` projection in **one transaction** (F10/F11); and **publish-time invariant
validation** (cycles, unreachable-required, live-key-removal warnings) that extends the map's existing
publish chain and is reused verbatim by the emergence proposal pipeline (F17). This sits at the head
of the remaining critical path — `f-guidance` (12) ranks what the engine says is eligible; the map
editor / dry-run simulator (14) and emergence (18) run maps through its invariant check.

## What ships here, and what deliberately does not

**In scope.** `GraphStore` (topology reads) · `computeAvailability` (pure, `now`-taking, explainable) ·
`applyEvent` (the sole writer, single-transaction) · publish-invariant validation (extends the
existing chain, callable standalone for F17). All pure/deterministic library code under
`lib/framework/facilitation/engine/`, proven by vitest + one write-path smoke.

**Out of scope** (owned by the features that consume the engine — no dead surface lands early):

- **The agent-facing transition capabilities** (`enter_module` / `complete_node`-style `BaseCapability`s
  that _request_ transitions) → **`f-guidance` (12)** / **`f-facilitation-agents` (13)**. This feature
  ships `applyEvent` as the validated library entry the capability wraps — the same pattern as `f-slots`
  shipping `getSlotHeads` before `f-slot-capture` wraps it (decision 8).
- **Guidance ranking / pgvector similarity** → `f-guidance` (12) / `f-overlays` (19). The engine reads
  **authored edges only** for eligibility; similarity is never consulted here (F9).
- **The map editor + journey dry-run simulator UI** → `f-map-editor` (14) (it _calls_ the pure engine).
- **The emergence proposal pipeline** (risk classification, approval queue, publish) → `f-emergence`
  (18); this feature ships only the **invariant-check stage** that pipeline reuses (F17).
- **Engagement stats / event aggregation over the stream** → `f-engagement` (08). The engine _writes_
  `JourneyEvent`s; the stats read-side is 08.
- **No API routes, no boot hook, no capability registration** — pure backend, "testable without any
  UI" (§10, Phase 2). Called at request time by later capability features (decision 8).

## Reconciliation with current repo reality — the design decisions

Organising principle, carried from [[f-journey-state]] / [[f-slots]]: **ship nothing a fork has to
delete**, and **follow the shipped code, not the rev-16 spec sketch, where they diverge** (the spec
predates the fork — verified against the tree). Decisions (2026-07-05):

1. **`GraphStore`'s first impl is in-memory traversal over the parsed published map, not a recursive
   CTE (deviates from F8's letter, honours its binding intent).** F8 commits to a
   `GraphStore` **interface** with "Postgres now, a graph DB is a later swap, not a rewrite", and
   _sketches_ "Prisma + recursive CTEs" as the impl. But the shipped `getPublishedMap(slug)`
   ([`version-service.ts`](../../lib/framework/facilitation/map/version-service.ts)) already
   materialises the **whole** bounded map (`MapDefinition`: all nodes + edges, ≤ low-hundreds — F8's own
   sizing) into memory, and maps are authored/bounded. So the reachability/neighbours/paths ops run as
   plain graph algorithms in TypeScript over that loaded definition — **still Postgres-backed** (the map
   lives in Postgres; no second datastore), but pure, fully vitest-coverable, and _not_ the repo's
   first-ever `WITH RECURSIVE` (there is no recursive-SQL precedent in-tree). F8's binding commitment —
   the _interface_ + "Postgres now, swap later" — is met; pushing traversal into SQL earns its cost only
   when collective-journey analytics demand deep in-DB pathfinding at scale (F8's own "later" trigger),
   at which point it is a **behind-the-interface impl swap** — t-1's internals and its test shape
   change, the interface and every downstream task do not. This is settled: t-1 ships the in-memory
   impl.
2. **Sizing: 5 indicative → 4 promoted (fold temporal into availability).** The
   board's t-2 (availability = edges + state + slot) and t-3 (temporal + timezone `now`) **fold into one
   availability PR**: `computeAvailability`'s condition evaluator is a single `switch` over the
   `{state|slot|temporal}` discriminated union ([`map/schema.ts`](../../lib/framework/facilitation/map/schema.ts)),
   and shipping an evaluator that handles two families but not the third leaves an incoherent
   intermediate (a map with a temporal gate behaves wrong until t-3). The temporal work is the four-kind
   evaluation against a `now` the engine already takes as input; the timezone _resolution_ is a thin
   caller-side concern (decision 5), not a separate write surface. Net 5 → 4, mirroring [[f-module-core]]
   (4→3) and [[f-journey-state]] (3→2). This is settled. **Execution-time escape hatch (not a pending
   confirmation):** if availability bloats past one PR, temporal splits back out to a t-2b.
3. **Follow the shipped types — import, never redefine.** The engine **evaluates** the exact shapes
   `f-map` shipped and **writes** the exact tables `f-journey-state` shipped:
   - `MapNode` / `MapEdge` / `MapCondition` / `MapDefinition` from
     [`map/schema.ts`](../../lib/framework/facilitation/map/schema.ts) — the Zod-inferred types (the
     three condition families are already a discriminated union with a shipped `superRefine`; the engine
     imports and evaluates, it does not re-declare the format).
   - `NODE_STATE_STATUS` from [`journey/vocabulary.ts`](../../lib/framework/facilitation/journey/vocabulary.ts)
     — the writer sets `status` from these constants, never string literals (the column + the vocab list
     are hand-synced, X1).
   - `completionMode` is a **node** field (default `'once'`), not an edge/condition field; its runtime
     effect lives in `UserNodeState.timesCompleted` (F6).
4. **`UserNodeState` is _upserted_ (mutable projection), not insert-only.** Unlike `SlotValue` (insert-
   only, versioned), the projection is the **materialised head** keyed `@@unique([journeyId, nodeKey])`
   (F10). The **`JourneyEvent`** is the insert-only source of truth; `applyEvent` writes both in one
   `executeTransaction` — append the event, upsert the projected node-state row. Mirror the transaction
   shape of [`appendSlotValue`](../../lib/framework/data-slots/values.ts) (single shared `now`; no
   engine-side retry — a P2002 rolls the transaction back and the caller re-requests).
5. **`applyEvent` sets `userId` on every `JourneyEvent` (shipped shape, not the spec sketch).** The
   spec §5.2 sketches `JourneyEvent { journeyId, … }`; the **shipped** model adds a plain scalar
   `userId` FK (hand-written cascade — the erasure path for _every_ row) with `journeyId` optional. A
   journey-traversal event the engine writes sets **both** `userId` and `journeyId` (+ `nodeKey`); the
   `userId` is non-negotiable (a `journeyId`-only row would be a GDPR hole — the f-journey-state
   decision this feature inherits).
6. **`now` is a resolved instant the engine takes as a pure input; a thin `resolveJourneyNow` seam
   reads the timezone from `User.timezone`.** Per §C7 (the one adjacent interface the spec says to carry
   from Phase 2), a deadline gate for a user abroad needs per-user timezone resolution — but the engine
   stays pure and timezone-agnostic: it takes an already-resolved `now: Date`. The resolution source is
   settled: core `User` already carries `timezone String? @default("UTC")` (IANA,
   [`auth.prisma`](../../prisma/schema/auth.prisma) — the _only_ timezone column in the schema tree, and
   unused by journey logic today). A thin `resolveJourneyNow(userId, at?)` seam reads it, falling back to
   UTC when null (the column already defaults `"UTC"`), and hands the pure engine the resolved instant.
   `UserJourney` has no timezone column and needs none — the source is the journey's user. The seam is a
   clearly-separated non-pure helper (exactly as `applyEvent` is the non-pure writer); the pure cores
   never read a clock or the DB. Boundary: `User` is Sunrise-owned, but reading a scalar through its
   published model interface needs **no core edit and no migration**. Temporal `at` values are stored
   zoned-ISO (`offset: true`, [`map/schema.ts`](../../lib/framework/facilitation/map/schema.ts)), which
   dovetails.
7. **The write path re-uses `computeAvailability` for its entry check — one source of eligibility
   truth.** `applyEvent`'s "entering a node requires it to be available" (§5.3) is answered by the same
   `computeAvailability` the read side uses, not a parallel gating check in the writer. A hallucinated
   `enter('locked-thing')` is rejected with a **structured reason** (the locked node's own explanation),
   not obeyed (F11). This keeps gating logic in exactly one place.
8. **No boot hook, no routes, no capability — pure library, proven then consumed later.** The engine is
   deterministic library code called at request time (like `appendSlotValue` / the map version-service —
   none register a boot hook). It ships the engine + its proof (units + one write-path smoke); the
   agent-facing capabilities that _call_ `applyEvent` are `f-guidance`/`f-facilitation-agents` (the
   `getSlotHeads`-before-`f-slot-capture` precedent). New `lib/framework/facilitation/engine/**` only.
9. **Publish-invariant validation _extends_ the existing chain; it does not re-implement static checks.**
   [`validatePublishableMap()`](../../lib/framework/facilitation/map/version-service.ts) already chains
   Zod → `validateMapFormat` (referential integrity) and its doc comment reserves the graph-invariant
   stage for this feature. `validate.ts` already does the **static structural** checks incl.
   region-containment cycles — the engine adds only the **conditional** invariants it alone can decide:
   **prerequisite-edge cycles**, **unreachable-required nodes** (both reuse t-1's traversal), and
   **live-key-removal warnings** (needs journey-state — which journeys hold live state on a key being
   removed/re-gated, F2). Appending an I/O-bearing stage may make the chain `async`; the public service
   API (`createGraph`/`publishDraft`/`rollback`) stays async-stable (its three internal callers gain an
   `await`). Built **standalone and callable** so `f-emergence` (18) runs proposals through the identical
   stage (F17).
10. **pgvector stays out of eligibility (F9).** The engine reads authored edges only; `related_to` edges
    are advisory (feed guidance, never gate — F3), and node embeddings are never read here. Similarity is
    a `f-guidance`/`f-overlays` concern.
11. **Slot-predicate evaluation reads slot heads via `getSlotHeads`, guarded by `canRead` at the call
    site.** `slot`-family conditions read the typed `valueJson` head (never prose, §6.1) and evaluate
    `gte|lte|eq` + `minConfidence`. `getSlotHeads` is the raw engine `f-slots` shipped and is **not**
    `canRead`-wrapped ([`access.ts`](../../lib/framework/shared/access.ts) documents this) — so the
    engine (or its capability caller) calls `canRead(viewer, subject, scope)` **before** reading slots,
    supplying the seam `getSlotHeads` left open (the guarding path f-journey-state documented).

## Reuse anchors found in-tree

- **The map read + types** — `getPublishedMap(slug)` returns a parsed `{ slug, version, definition }`
  ([`version-service.ts`](../../lib/framework/facilitation/map/version-service.ts)); `MapNode`/`MapEdge`/
  `MapCondition`/`MapDefinition` + the closed `NODE_TYPES`/`EDGE_TYPES`/`CONDITION_FAMILIES`/
  `TEMPORAL_KINDS`/`COMPLETION_MODES` vocabularies ([`map/schema.ts`](../../lib/framework/facilitation/map/schema.ts)).
  `GraphStore.getPublishedGraph` wraps `getPublishedMap`; everything else evaluates these types.
- **The publish chain to extend** — `validatePublishableMap()` + `validateMapFormat()`
  ([`map/version-service.ts`](../../lib/framework/facilitation/map/version-service.ts),
  [`map/validate.ts`](../../lib/framework/facilitation/map/validate.ts)); the doc comments name the
  invariant stage as this feature's, and reserve exactly the three conditional invariants for it.
- **The state tables + status vocab** — `UserJourney`/`UserNodeState`/`JourneyEvent`
  ([`framework-facilitation.prisma`](../../prisma/schema/framework-facilitation.prisma)); `NODE_STATE_STATUS`
  ([`journey/vocabulary.ts`](../../lib/framework/facilitation/journey/vocabulary.ts)); the `canRead`-guarded
  reads `getJourney`/`getNodeStates`/`getJourneyTimeline` ([`journey/queries.ts`](../../lib/framework/facilitation/journey/queries.ts))
  — the engine is the writer these readers were built to consume.
- **The single-transaction insert-only precedent** — `appendSlotValue`
  ([`data-slots/values.ts`](../../lib/framework/data-slots/values.ts)): one `executeTransaction`, single
  shared `now`, `@@unique` concurrency backstop, no retry. `applyEvent` mirrors the transaction shape
  (append event + upsert projection instead of version-stamp + insert).
- **Module liveness (consumed, not recomputed)** — `isModuleLive(module, flags, now, entitlement?)`
  ([`modules/liveness.ts`](../../lib/framework/modules/liveness.ts)) is pure and takes `now` "exactly as
  the facilitation engine takes `now`"; `computeAvailability`'s `moduleLiveness` input is its verdict
  (A5) — the engine intersects, never re-derives.
- **The timezone-resolution source** — `User.timezone` (`String? @default("UTC")`, IANA,
  [`auth.prisma`](../../prisma/schema/auth.prisma)) is the one timezone column in-tree; the
  `resolveJourneyNow(userId, at?)` seam (decision 6) reads it (UTC fallback) to produce the resolved
  `now` the pure evaluator takes. `UserJourney` carries none — the source is the journey's user.
- **The access + scope seams** — `canRead`/`subjectScope`/`JourneyViewer`/`AccessScope`
  ([`shared/access.ts`](../../lib/framework/shared/access.ts)) and `NodeKey`/`ModuleSlug`/`FrameworkScope`
  ([`shared/scope.ts`](../../lib/framework/shared/scope.ts)) — use these; mint no parallel types.
- **Errors + transaction helper** — `NotFoundError`/`ValidationError`/`ForbiddenError`
  ([`lib/api/errors.ts`](../../lib/api/errors.ts)); `executeTransaction`
  ([`lib/db/utils.ts`](../../lib/db/utils.ts)).
- **Domain layout + barrel** — `data-slots/` and `map/` split `schema`/`validate`/writer/`queries`/
  `vocabulary`/`index`; the engine slots in as a sibling `facilitation/engine/` with its own barrel,
  re-exported from [`facilitation/index.ts`](../../lib/framework/facilitation/index.ts).
- **The write-path smoke template** — `scripts/smoke/erasure.ts` already seeds `userJourney` +
  `userNodeState` + `journeyEvent` rows against the real dev DB with the safe prefix/cleanup discipline;
  it is the template for an `engine` smoke proving `applyEvent`'s transaction.

## Test strategy (vitest — no live DB) — stated up front (B9)

Vitest runs on `happy-dom` with **no live DB**. The engine is mostly _pure_, so most of it is the
vitest sweet spot:

- **`GraphStore` (t-1, in-memory) + `computeAvailability` (t-2) + publish invariants (t-4)** are pure
  functions of `(definition, state, now)` — **table-driven vitest** over hand-authored `MapDefinition`
  fixtures (in `tests/`, not shipped). No DB mock needed for the topology + evaluation cores. Cover: the
  four edge semantics (prerequisite=all, unlocks=any, tangent=always-open, related_to=ignored-for-
  eligibility); each condition family incl. all four temporal kinds against a controlled `now`;
  module-liveness intersection (a journey-unlocked node whose module is flag-off is still locked);
  explainable lock reasons; cycles + unreachable-required detection.
- **`applyEvent` (t-3)** → **mock `@/lib/db/client`** and **forward `executeTransaction` to a `tx` mock**
  (`async (cb) => cb(prismaFake)`) — the [`appendSlotValue` test pattern](../../tests/unit/lib/framework/data-slots/values.test.ts).
  Assert: one transaction; `JourneyEvent` appended with `userId` set; `UserNodeState` upserted with the
  right `status`/`timesCompleted`/timestamps; once vs repeatable branching; a request for an unavailable
  node **rejected with a structured reason and no write**.
- **Slot-predicate reads** → mock `getSlotHeads`; assert `canRead` is called before it (the guarding
  path) and that a denied read short-circuits.
- **Write-path fidelity** → **one real-DB smoke** (`scripts/smoke/engine.ts`, mirroring `erasure.ts`):
  seed a graph + journey, drive an `applyEvent`, assert the real `JourneyEvent` row + `UserNodeState`
  projection, self-clean. This is the one place the transaction touches real Postgres.

Never "integration test against the dev DB" in vitest.

## Tasks (promoted)

| ID                                                                                                    | Task                                                                                                                                                                                                                                                 | Files                                                                 | Deps | Status | PR  |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---- | ------ | --- |
| t-1                                                                                                   | **GraphStore.** Interface + in-memory traversal over the parsed published map — `getPublishedGraph`, `reachableFrom`, `neighbours`, `pathsBetween`, prerequisite-cycle + reachability primitives, region granularity (F5). Foundation for t-2 + t-4. | `lib/framework/facilitation/engine/{graph-store,index}.ts`, `tests/…` | —    | done   | #34 |     | t-2 | **Availability computation.** `computeAvailability(publishedGraph, nodeStates, moduleLiveness, now)` — typed-edge eval (F3) + all three condition families incl. temporal (F4) + module-liveness intersection (A5) + explainable lock reasons + `validMoves` + `firsts`; pure resolved `now` + the `resolveJourneyNow` seam (reads `User.timezone`, UTC fallback — decision 6). _(Folds board t-2 + t-3.)_ | `engine/{availability,conditions,now}.ts`, `tests/…` | t-1 | done | #36 |     | t-3 | **`applyEvent` — the sole writer.** Entry requires availability (reuses t-2); once/repeatable semantics (F6); single-transaction `JourneyEvent` append (`userId` set) + `UserNodeState` upsert (F10); structured rejections (F11); write-path smoke. | `engine/apply-event.ts`, `scripts/smoke/engine.ts`, `tests/…` | t-2 | done | #37 |     | t-4 | **Publish-time invariant validation.** Extend `validatePublishableMap` with prerequisite-edge cycles + unreachable-required (reuse t-1) + live-key-removal warnings (journey-state, F2); standalone/callable for `f-emergence` (18, F17). | `engine/invariants.ts`, `map/version-service.ts` (append stage), `tests/…` | t-1 | done | #38 |
| **Sizing (B1 self-check): 5 indicative → 4 promoted.** Temporal (board t-3) folds into availability   |
| (decision 2). t-4 depends only on t-1 (not t-2/t-3), so it can run in parallel with the t-2→t-3 chain |
| once GraphStore lands. **Both the fold and the GraphStore-impl call (decision 1) are settled — t-1    |
| ships in-memory.**                                                                                    |

### t-1 · GraphStore — topology over the published map

The interface (F8) + its first impl. `getPublishedGraph(slug)` wraps `getPublishedMap`; `reachableFrom`
/ `neighbours` / `pathsBetween` are graph algorithms over the loaded `MapDefinition`; cycle-detection
and reachability primitives are exported for t-4. Region nodes are first-class (F5) — traversal +
reporting work at region granularity. In-memory over the bounded map (decision 1, settled). No writer,
no state — pure topology.

**Done when:** the `GraphStore` interface + impl expose the F8 ops; traversal is correct over authored
fixtures incl. regions (F5); cycle + reachability primitives are exported for t-4; pure vitest green;
**gates green — `/pre-pr` then `/code-review`, both before opening the PR** (B4).

### t-2 · Availability computation — the explainable picture

`computeAvailability(publishedGraph, nodeStates, moduleLiveness, now)` → `{ perNode: available|locked
(+reason), validMoves, firsts }`. Typed-edge semantics (F3: prerequisite=all incoming satisfied,
unlocks=any one, tangent=always-open, related_to=ignored for eligibility); the three condition families
(F4) evaluated against `nodeStates`, slot heads (`getSlotHeads`, `canRead`-guarded — decision 11), and a
pure resolved `now` (all four temporal kinds — decision 6); intersect with `isModuleLive`'s verdict (A5);
every locked node carries its reason (§5.3, F12). Pure — no DB writes. The `resolveJourneyNow` seam
(`engine/now.ts`) reads `User.timezone` (UTC fallback) to produce that `now` **before** the pure
evaluator runs — `computeAvailability` itself stays a pure `now`-taker.

**Done when:** all four edge semantics + all three families (incl. four temporal kinds) evaluate
correctly; module-liveness intersection closes a flag-off node; every locked node has an explainable
reason; `validMoves`/`firsts` correct; pure vitest green (controlled `now`); **gates green** (B4).

### t-3 · `applyEvent` — the sole writer

The one validated write path (F11). Validates the requested transition against `computeAvailability`
(decision 7) — reject unavailable targets with a **structured reason, no write**; apply once/repeatable
semantics (F6: `once` closes; `repeatable` increments `timesCompleted`, reopens subject to any
`cooldown_since_last_visit`); append the immutable `JourneyEvent` (with `userId` — decision 5) **and**
upsert the `UserNodeState` projection in **one `executeTransaction`** (F10; single shared `now`; no
retry — decision 4). No agent-facing capability (decision 8).

**Done when:** an accepted transition writes event + projection in one transaction with correct
once/repeatable state; a request for an unavailable node is rejected with a structured reason and zero
writes; `userId` set on every event; mocked-prisma units + the `scripts/smoke/engine.ts` write-path
smoke green; **gates green** (B4).

### t-4 · Publish-time invariant validation

Extend the shipped `validatePublishableMap` chain (decision 9) with the three conditional invariants:
prerequisite-edge cycles + unreachable-required nodes (reuse t-1's traversal) + live-key-removal
warnings (query journey-state for live state on keys being removed/re-gated, F2). Built as a standalone,
callable stage so `f-emergence` (18) runs proposals through the identical check (F17). May make the
chain `async` (public service API stays stable — decision 9). Does **not** re-implement the static
checks already in `validate.ts`.

**Done when:** the invariant stage flags prerequisite cycles + unreachable-required + live-key-removal
(warning, not hard-fail, for the last); it is callable standalone (F17-ready); the existing publish
callers still pass with the (possibly async) chain; no duplication of `validate.ts`'s static checks;
mocked-prisma + pure units green; **gates green** (B4).

## Boundary & forkability notes

- **Everything is framework-tier — no upstream Sunrise issue.** All new `lib/framework/facilitation/engine/**`
  imports core only through public seams (`@/lib/db/client`, `@/lib/db/utils`, `@/lib/api/errors`) and
  shipped framework modules; it writes only `framework_*` tables. Like `f-map`/`f-journey-state`'s engine
  work, it touches no Sunrise seam, so it **files no upstream issue** and adds no
  [[upstream-asks|upstream-asks]] row. The boundary CI covers it both directions.
- **No migration.** The tables exist (`f-journey-state` t-1). This feature is code-only — no
  `framework_*` migration, so the pgvector/tsvector DROP-strip step (B13) does **not** apply.
- **Leaf surface stays reserved-empty.** No `lib/app/*`; a leaf gets the engine for free by authoring a
  map + walking it. Daybreak ships zero journeys → the engine is inert until a map is walked.
- **Ship nothing a fork strips.** The engine is proven by `tests/` fixtures + one smoke, not by demo data.

## Open questions

**Resolved (see reconciliation decisions 1 / 2 / 6):** GraphStore ships **in-memory traversal** behind
the F8 interface (a recursive-CTE is a later behind-the-interface swap, not a t-1 branch); temporal
**folds into availability** (5→4, with a t-2b escape hatch only if the PR bloats); and the timezone
`now` source is **`User.timezone`** (IANA, UTC fallback) read by the `resolveJourneyNow` seam. Each is
grounded in shipped code (`getPublishedMap` full-materialises the bounded map · `MapCondition` is one
discriminated union · `User.timezone` exists at `auth.prisma`). One question remains open:

- **`applyEvent` signature granularity.** The spec sketch is `applyEvent(state, event)`, but the real
  entry check needs the map + module-liveness + resolved `now` too. Proceeding with an assembled context
  (`{ map, journey, nodeStates, liveness, now }`, event) — exact shape is a t-3 detail; a higher-level
  `requestTransition` that assembles the context may wrap it. Owner to confirm at t-3.

## Done when (feature)

`GraphStore` exposes the F8 topology ops over the published map; `computeAvailability` is a pure,
`now`-taking, explainable function evaluating the four edge semantics + three condition families,
intersected with module liveness; `applyEvent` is the **sole writer**, validating transitions against
that same availability and writing the immutable event + the upserted projection in one transaction with
structured rejections; publish-invariant validation extends the shipped chain and is callable standalone
for `f-emergence`; pgvector stays out of eligibility; the whole path is proven by pure vitest + mocked-
prisma units + one write-path smoke — **with a fresh fork booting to empty journey tables, nothing to
strip, no upstream issue, no migration.** On the last merge: flip `f-engine` → **shipped**, flip
**`f-guidance` (12)** toward `available` as its other dep (`f-slot-capture`) allows, flip **`f-map-editor`
(14)** / **`f-emergence` (18)** blockers to reflect the engine landing, add a Work-completed log line,
and append execution lessons to [[planning-retro]] §B.

## References

- [[plan#11 · `f-engine` — deterministic engine + GraphStore|plan.md feature 11]] — parent.
- [[framework-architecture#5.3 The engine — deterministic core|spec §5.3]] (the engine) +
  [[framework-architecture#5.1 The map — authored structure|§5.1]] (map + GraphStore) +
  [[framework-architecture#4.1 Module liveness|§4.1]] (A5) + §5.5 (proposal pipeline, F17) + §C7
  (timezone `now`) + Appendix A (F2–F19 / A5 / X1–X6 as listed in the frontmatter).
- [[f-journey-state]] — the state tables the engine writes, the `canRead` seam, `NODE_STATE_STATUS`, and
  the "ship the engine before its capability" pattern this mirrors.
- [[f-map]] — the map format + the publish-validation chain t-4 extends; `getPublishedMap` t-1 wraps.
- [[f-slots]] — `getSlotHeads` (the unguarded slot-read seam decision 11 guards) + the single-transaction
  insert-only precedent + the B1 sizing fold.
- [[planning-retro]] — process lessons applied here (B1 sizing, B4 gates-in-done-when, B9 vitest strategy,
  B12 barrel/import discipline); fold new lessons back on close-out.

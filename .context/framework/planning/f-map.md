---
name: f-map
feature: 04 · f-map
epic: Framework v1
status: in flight (planning — t-1 next)
owner: Simon Holmes
depends_on: f-bootstrap (shipped — #4 / #6 / #8 / #9)
spec: framework-architecture.md §5.1 (the Map) + §5.3 / §5.5 / §5.6 / §7, Appendix A (F1–F5, F8, F19, X1, X6)
parent: plan.md
opened: 2026-07-03
---

# f-map — the facilitation map

> Feature-level build plan for **`f-map`**, the authored typed-graph map: versioned
> snapshots, the node/edge/region/condition JSON format, and format-level publish
> validation. Parent: [[plan#04 · `f-map` — facilitation map|plan.md]].
> Binding _how_: [[framework-architecture#5.1 The Map — authored structure|§5.1]] and the
> F-decisions in Appendix A (F1 snapshot versioning · F2 stable keys · F3 four edge types ·
> F4 family-tagged conditions · F5 first-class regions · F19 multi-graph). Sizing follows the
> parent plan: **task = one PR** (~200–600 lines, cohesive, reviewable).
>
> Read [[building-a-feature]] first if you're picking this up — it's the execution rhythm this
> plan assumes.

## Intent

Stand up the **authored map** (spec §5.1): a versioned typed property graph that describes the
places a user can dwell in and the typed relationships between them. Three things ship here — the
**models** (`FacilitationGraph` + immutable `FacilitationGraphVersion` snapshots, mirroring
`AiWorkflowVersion`), the **version service** (draft-on-edit → publish → non-destructive rollback,
the workflow discipline F1), and the **JSON format** for nodes/edges/regions/conditions (F3/F4/F5)
with **format-level publish validation**. This is the structural half of the facilitation spine;
`f-journey-state` adds per-user traversal, `f-engine` adds the deterministic reader, `f-guidance`
makes it felt in conversation.

**What ships here, and what deliberately does not.** In scope: the two models + migration, the
map version service (create/draft/publish/rollback/read), the format Zod schema, `validateMapFormat`
(within-snapshot referential integrity), and the admin API over the service. **Out of scope** (owned
by the features that consume them, so no dead surface lands early):

- **The deterministic engine** — `GraphStore`, `computeAvailability`, `applyEvent`, and the
  **publish-time graph-invariant checks (prerequisite cycles, unreachable-required nodes)** — is
  **`f-engine`** (feature 11). The spec is explicit that these live in the engine (§5.3: _"the engine
  also hosts invariant validation for the authoring side"_; §5.5's pipeline separates _"schema
  validation → engine invariant check"_). f-map validates **format**; f-engine adds **invariants**.
- **The canvas editor** (palette, typed-edge drawing, region collapse/expand, per-node config panel,
  dry-run) → **`f-map-editor`** (feature 14, §5.6). f-map ships the API the editor drives, not the UI.
- **Per-user journey state**, `UserNodeState`, `JourneyEvent`, `canRead` → **`f-journey-state`** (§5.2).
  So the F2 _"warn on removing a key that has live user state"_ publish check is **not** here — it needs
  journey state to exist; it lands with f-engine/f-journey-state.
- **Node embeddings** (`framework_node_embedding`, pgvector) → **`f-overlays`** (feature 19, F9).

## The second pure framework-tier feature — no upstream issue

Like `f-module-core`, **`f-map` touches no Sunrise core seam.** Every piece — the models, the version
service, the format schema, the admin routes — lives in the **framework tier**
(`lib/framework/facilitation/map/`, `app/api/v1/admin/framework/maps/`) and only _consumes_ core
utilities through the allowed framework→core direction (see the boundary note below). Nothing here
belongs upstream, so **this feature files no upstream issue** and carries no cross-repo follow-up.

## Reconciliation with current repo reality

Per [[planning-retro#B2]], every feature plan reconciles the (rev-16) spec against the actual tree.
For f-map, most of what looked like open design is **already settled by the spec** once §5.3/§5.5/§5.6/§7
are read alongside §5.1 — recorded here so the settlement is explicit, not re-litigated at build time.

1. **Maps are data-authored, not code-first — a fresh fork boots with zero maps.** Unlike modules
   (`registerModule` + boot sync, A3), maps are **authored** through the API/editor (F1 draft/publish/
   rollback; §5.6 the editor; §7 _"draft-on-edit, promote-on-publish, non-destructive rollback"_ for
   the map). There is **no registration seam and no boot sync** — `f-map` does **not** participate in
   `syncFramework()`. A `git fork` of Daybreak boots to an **empty** `framework_facilitation_graph`
   table; the app author creates its map(s). Nothing to strip — naturally forkable, the same
   "ship nothing a fork deletes" principle as f-module-core, reached differently (no seed vs no seam).

2. **Ship the admin API here; defer the canvas to `f-map-editor`.** Not a judgement call — §7
   "Standard platform wiring" mandates it: _"New admin APIs under `/api/v1/admin/framework/**`
   (inherit rate limiting via the policy table, guarded by `withAdminAuth()`)… every config mutation
   written to the audit log."_ §5.6 places the canvas editor as its own later admin surface. So f-map
   ships the REST surface + audit-logs every mutation; the **editor UI is feature 14** (as
   f-module-core shipped a read API and deferred its _page_ to f-ops-views).

3. **Publish validation splits format (here) from invariants (f-engine).** §5.5's emergence pipeline
   lists them as **distinct sequential steps** — _"schema validation → engine invariant check →
   risk classification → approval → publish"_ — and §5.3 puts cycle/reachability checks in the engine.
   So `publishDraft` runs **format/referential validation only** (Zod shape + within-snapshot
   integrity). It is written as a **composable validation chain** so `f-engine` slots a
   `validateGraphInvariants` step in later without reshaping the service — the same "shape the seam
   now, wire it later" discipline as `syncFramework()` and `canRead`. _Interim window:_ between f-map
   and f-engine a structurally-valid-but-cyclic map could publish, but no real maps exist until an app
   authors one and f-engine is the very next critical-path feature — accepted, noted in Open questions.

4. **#368 `executeTransaction` options are not needed here (spec-assumption correction).** plan.md's
   inherited-improvements table lists _"map snapshot writes (f-map)"_ under #368's boot-time bulk-upsert
   timeout headroom. But f-map has **no boot-time path** — a publish is a small **admin-triggered,
   single-map** `$transaction` (version insert + graph update + clear draft), exactly
   `version-service.ts`'s shape. So f-map uses plain `prisma.$transaction`, **not**
   `executeTransaction({ timeout })`; the #368 note was written when map authoring was imagined as a
   boot-time registration (it isn't). A [[planning-retro#A1]]-style verify-the-assumption correction.

5. **Test strategy up front ([[planning-retro#B9]]).** vitest runs on `happy-dom` with **no live DB**.
   The format validator (t-1) is **pure** → exhaustive unit tests, no mocking. The version service (t-2)
   and API (t-3): mock `@/lib/db/client`, forward `$transaction` to a `tx` mock, assert the exact
   create/update calls; prove the create→publish→read→rollback chain with a small **stateful in-memory
   Prisma fake** (the f-module-core t-3 pattern); `smoke:*` only if real-DB fidelity is later wanted.

6. **CHANGELOG:** f-map adds **no Sunrise public surface** (`CHANGELOG.md` is Sunrise-owned; Daybreak's
   own changelog doesn't exist yet). Consistent with f-module-core, **no `CHANGELOG.md` entry** — the
   `/pre-pr` 5d check keys on Sunrise public-surface paths, none of which f-map touches.

### Concrete reuse anchors found in-tree

- **`lib/orchestration/workflows/version-service.ts`** is the **near-exact template** — copy its shape:
  `saveDraft` / `discardDraft` / `publishDraft` / `rollback` / `createInitialVersion` / `listVersions` /
  `getVersion`, the `validatePublishable…` chain, `nextVersionNumber`, per-mutation `logAdminAction`,
  the "rollback = new version copying the target (history never rewritten)" rule, and single
  `$transaction` for multi-row writes. f-map's service is this, retargeted to the map models.
- **`AiWorkflow` / `AiWorkflowVersion`** (`orchestration-workflows.prisma`) — the model shape to mirror
  (`draftDefinition Json?`, `publishedVersionId`, `@@unique([graphId, version])`, `@db.Text`
  `changeSummary`, `createdBy String?`).
- **`logAdminAction`** (`@/lib/orchestration/audit/admin-audit-logger`) — **framework→core import is
  ALLOWED** (the framework-tier ESLint block bans only `@/lib/app/**`; framework→core is the sanctioned
  direction). Passing a generic `entityType: 'facilitation_graph'` string adds no framework vocabulary
  to core (the "generic scope map passes, `moduleId` field fails" test, X6). Same for `NotFoundError` /
  `ValidationError` from `@/lib/api/errors`.
- **`NodeKey`** already exists in `lib/framework/shared/scope.ts` — node `key`s reuse it.
- **`framework-facilitation.prisma`** is the empty skeleton (header + convention only, from f-bootstrap
  t-1) — the two models land here; `framework_`-prefixed table names via `@@map`, `framework_`-named
  migration touching only `framework_*` tables.
- **`app/api/v1/admin/framework/`** namespace + its X6 ESLint glob were opened by f-module-core's
  `modules/route.ts`; `maps/` is a sibling under the same (already-green) framework-tier glob.

## Tasks (promoted)

| ID  | Task                                                                                                         | Files                                                                                                                                                                         | Deps | Status    | PR  |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | --- |
| t-1 | **Map format + validator** (pure): Zod node/edge/region/condition schema + `validateMapFormat` (+ this plan) | `lib/framework/facilitation/map/{schema,validate,index}.ts`, `tests/…`, `.context/framework/planning/f-map.md`                                                                | —    | available | —   |
| t-2 | **Models + version service**: `FacilitationGraph`(+`Version`) + create/draft/publish/rollback/read           | `prisma/schema/framework-facilitation.prisma`, `framework_…` migration, `lib/framework/facilitation/map/version-service.ts`, `lib/framework/facilitation/index.ts`, `tests/…` | t-1  | backlog   | —   |
| t-3 | **Admin API + end-to-end proof**: CRUD + publish/rollback/versions routes                                    | `app/api/v1/admin/framework/maps/**/route.ts`, `tests/integration/{api/v1/admin/framework/maps,lib/framework/facilitation}/*`                                                 | t-2  | backlog   | —   |

**Three promoted PRs** (parent plan's `~4` is indicative; folds to 3 the way f-module-core's did — the
node-format and edge/condition rules are one cohesive Zod schema, so splitting them is an artificial
seam, [[planning-retro#B1]]). **t-3 is the heaviest** — a full CRUD + version surface, genuinely bigger
than f-module-core's single GET. If it exceeds ~1 comfortable PR when built, split the read routes +
e2e proof into a t-4; plan it as one and decide at build time (honest sizing, not pre-padding).

### t-1 · Map format + validator — the pure format contract

The heart of the feature as pure, DB-free, exhaustively-testable code (the `isModuleLive` discipline):
the JSON format every later layer reads, and its within-snapshot integrity check. F3 + F4 + F5. Carries
this plan doc.

- **`lib/framework/facilitation/map/schema.ts`** — Zod schemas for the snapshot `definition`:
  - **`conditionSchema`** — a `z.discriminatedUnion('family', …)` over the **three families defined now**
    (F4): `state` (e.g. `{ family:'state', milestone: NodeKey, reached: boolean }`), `slot`
    (e.g. `{ family:'slot', slug, op: 'gte'|'lte'|'eq', value, minConfidence? }`), `temporal`
    (`available_after` / `available_until` / `recommended_by` / `cooldown_since_last_visit`). The
    discriminated union **rejects unknown families at parse** — that _is_ F4's "reject unknown
    families." Keep each family's payload **minimal** and note it's the _format_ only; **`f-engine`
    evaluates** these (f-map never interprets a condition). Flag any payload shape f-engine may need to
    adjust as a t-1 open note rather than over-designing.
  - **`nodeSchema`** — `key` (NodeKey), `type: z.enum(['module','stage','milestone','region'])`,
    `moduleSlug?` (**required when `type==='module'`** via `.refine`/`superRefine`), `stage?`,
    `region?` (NodeKey of the containing region), `completionMode: z.enum(['once','repeatable']).default('once')`,
    `onFirstArrival?` (a small ref object — workflow/agent slug; keep loose, it's consumed later),
    `meta?`.
  - **`edgeSchema`** — `from` (NodeKey), `to` (NodeKey), `type: z.enum(['prerequisite','unlocks','tangent','related_to'])`
    (**exactly four**, F3), `condition?: conditionSchema`, `meta?`.
  - **`mapDefinitionSchema`** — `{ nodes: nodeSchema[], edges: edgeSchema[] }`, the full snapshot.
  - **X1 note:** the closed sets here are **format validation** (Zod `z.enum` on a `Json` column), not
    Prisma enum _columns_ — so no conflict with X1 (which bans Prisma enums on schema columns). Closed-set
    validation is exactly what belongs in the Zod layer.
- **`lib/framework/facilitation/map/validate.ts`** — `validateMapFormat(definition) → { ok: true } |
{ ok: false; errors: {path,message}[] }` (mirroring `validator.ts`'s result shape), the **beyond-Zod
  referential integrity** within one snapshot: node `key`s unique; every `edge.from`/`edge.to` resolves
  to an existing node key; every `node.region` resolves to an existing node of `type:'region'`; the
  region-containment tree is **acyclic** (a format/hierarchy check on containers, F5 — distinct from
  prerequisite-edge cycles, which are f-engine's); `type:'module'` nodes carry a `moduleSlug`. **Not
  here:** prerequisite cycles, reachability, live-key-removal warnings (all f-engine/f-journey-state).
- **`lib/framework/facilitation/map/index.ts`** — barrel exporting the schema types + `validateMapFormat`.
- **Tests** — pure unit tests: valid snapshots (incl. regions, all four edge types, all three condition
  families, boundary payloads); each rejection path (unknown edge type, unknown condition family, dangling
  edge endpoint, region ref to a non-region, region cycle, module node missing `moduleSlug`, duplicate key).
- **Done when:** the schema parses valid maps and rejects each malformed case; `validateMapFormat` catches
  every within-snapshot integrity violation with a keyed message; the module is pure (no DB import);
  **gates green — `/pre-pr` then `/security-review` then `/code-review`** (retro B4).

### t-2 · Models + version service — the versioning spine

F1/F2/F19 as models + the `version-service.ts` discipline retargeted to maps.

- **`prisma/schema/framework-facilitation.prisma`** — two models (spec §5.1 sketch, mirroring
  `AiWorkflowVersion`):
  - **`FacilitationGraph`** — `id`, `slug @unique` (F19: multiple graphs per deployment), `name`,
    `description? @db.Text`, `draftDefinition Json?`, `publishedVersionId String?`, `createdBy String?`,
    timestamps; relations `versions`, `publishedVersion`; `@@index([publishedVersionId])`;
    `@@map("framework_facilitation_graph")`.
  - **`FacilitationGraphVersion`** — `id`, `graphId`, `version Int`, `definition Json` (full snapshot),
    `changeSummary String? @db.Text`, `createdBy String?`, `createdAt`; `graph` relation
    **`onDelete: Cascade`**; `@@unique([graphId, version])`, `@@index([graphId])`;
    `@@map("framework_facilitation_graph_version")`.
  - **`createdBy` is a bare `String?`, deliberately NOT a User FK** — per F17/§5.5 it holds a user id
    **or `"agent:<slug>"`** for approved proposals, so it can't be a `User` relation. The map is
    **authored config, not user data** — it carries no per-user personal-data FK, so the CLAUDE.md
    new-User-relation `onDelete` rule doesn't bite (personal data + the satellite convention arrive in
    `f-journey-state`, which uses a bare `userId String` + hand-written `ON DELETE CASCADE` + erasure hook
    to avoid editing Sunrise's `User` model).
- **Migration** — one `framework_…`-named migration touching only `framework_*` tables; authored with
  `prisma migrate dev --create-only` then reviewed (strip Prisma's spurious `DROP INDEX` for the
  unmodelled pgvector/tsvector objects — the t-1-of-f-module-core footgun; drift-check must stay green).
- **`lib/framework/facilitation/map/version-service.ts`** — the only writer of graph/version rows, a
  retarget of `version-service.ts`:
  - `createGraph({ slug, name, description, definition?, userId })` — insert the `FacilitationGraph`;
    if an initial `definition` is given, validate + `createInitialVersion` in the same `$transaction`.
  - `saveDraft` / `discardDraft` — write/clear `draftDefinition` (**no** format validation — admins save
    half-built maps, mirroring `saveDraft`).
  - `validatePublishableMap(definition)` — the **composable chain**: `mapDefinitionSchema.safeParse` →
    `validateMapFormat`; throws `ValidationError` with keyed messages. **This is the seam `f-engine`
    extends** with a `validateGraphInvariants` step (decision 3) — comment it as such.
  - `publishDraft` — validate the draft, then `$transaction`: `create` version (`nextVersionNumber`) +
    pin `publishedVersionId` + clear draft; `logAdminAction('facilitation_graph.publish')`.
  - `rollback(targetVersionId)` — re-validate the target snapshot, create a **new** version copying it,
    pin it (history never rewritten); audit.
  - `getPublishedMap(slug)` — read the published version, parse `definition` via `mapDefinitionSchema`,
    return typed. The basic fetch+parse read **`f-engine`'s `GraphStore.getPublishedGraph` builds on**
    (f-map ships fetch+parse; the engine adds traversal — F8).
  - `listVersions` / `getVersion` — paginated + single reads (copy verbatim).
- **`lib/framework/facilitation/index.ts`** — re-export the map barrel (`export * from '.../map'`).
- **Tests** — mocked-`@/lib/db/client`: `publishDraft` writes the right version + pins + clears draft +
  audits (and refuses when there's no draft / on invalid format); `rollback` copies the target as a new
  version; `getPublishedMap` returns parsed typed data; `nextVersionNumber` monotonic. No live DB.
- **Done when:** create/draft/publish/rollback/read all work against mocked prisma with the exact
  tx-call shape; publish rejects a format-invalid draft via the composable chain; rollback preserves
  monotonic history; `getPublishedMap` returns typed parsed data; **gates green — `/pre-pr` →
  `/security-review` → `/code-review`** (retro B4).

### t-3 · Admin API + end-to-end proof

The HTTP surface over the service (§7 mandate), extending the `app/api/v1/admin/framework/` namespace
f-module-core opened, and the end-to-end proof.

- **Routes** under `app/api/v1/admin/framework/maps/` — all `withAdminAuth`, all mutating bodies
  **Zod-validated** (`/pre-pr` 4j), rate-limit automatic via `proxy.ts` (no handler limiter), audit via
  the service:
  - `GET /maps` — list graphs · `POST /maps` — create (`createGraph`)
  - `GET /maps/[slug]` — detail (draft + published) · `PATCH /maps/[slug]` — save draft ·
    `DELETE /maps/[slug]` draft (discard) _or_ a `/draft` sub-route (pick the shape closest to the
    workflow routes at build time)
  - `POST /maps/[slug]/publish` — publish (body: `changeSummary?`)
  - `POST /maps/[slug]/rollback` — rollback (body: `targetVersionId`, `changeSummary?`)
  - `GET /maps/[slug]/versions` — list versions
- **Two test files** (the f-module-core split — contract test needs no `@/lib/framework` import so it
  lives at the conventional API path; the e2e imports framework fns so it lives at the boundary-exempt
  `tests/**/lib/framework/**` path):
  - `tests/integration/api/v1/admin/framework/maps/*` — HTTP contract: admin-guarded (401/403, DB
    untouched), create/publish/rollback happy paths in the envelope, `400` on invalid body/format,
    `[]`/empty on the clean-fork state. Mocks prisma + auth.
  - `tests/integration/lib/framework/facilitation/map-lifecycle.test.ts` — **end-to-end** against a
    stateful in-memory Prisma fake: `createGraph` → `saveDraft` → `publishDraft` → `getPublishedMap`
    (returns the published snapshot) → edit + republish (v2) → `rollback` to v1 (v3 copies v1), proving
    the version chain and published-pointer move end-to-end.
- **Done when:** every route is admin-guarded and returns the standard envelope; a fresh tree lists no
  maps (clean-fork state); the e2e drives create→publish→read→rollback green; boundary CI stays green
  with the new `maps/` path; **gates green — `/pre-pr` → `/security-review` → `/code-review`** (retro B4).

## Boundary & forkability notes

- **Everything is framework-tier.** All `lib/framework/facilitation/**` code imports core only through
  the allowed framework→core direction (`logAdminAction`, `@/lib/api/errors`, `@/lib/db/client`); the
  boundary CI (f-bootstrap t-2) covers it both ways. `app/api/v1/admin/framework/maps/**` is inside the
  framework-tier ESLint glob already exercised by f-module-core.
- **No leaf surface, no boot participation.** f-map adds nothing to `lib/app/*` and does **not** touch
  `syncFramework()` — maps are authored data, not registered code. `initApp()`'s frozen shape is
  unchanged.
- **A fresh fork boots with zero maps** — empty `framework_facilitation_graph`, no seed, nothing to
  strip. The app author creates its map(s) through the API (later, the editor).

## Open questions

- **Interim publish without invariant checks.** Between f-map and f-engine, `publishDraft` runs format
  validation only — a cyclic-prerequisite map _could_ publish. Accepted: no real maps exist until an app
  authors one, and f-engine (which adds `validateGraphInvariants` to the composable chain) is the next
  critical-path feature. Not blocking; revisit if any map is authored before f-engine lands.
- **Condition payload shapes may firm up in f-engine.** t-1 defines the three families' payloads as the
  _format_; f-engine, which _evaluates_ them, is the first real consumer and may need a field adjusted.
  Keep payloads minimal now; treat a later additive field as expected, not churn (F4's tag is what makes
  it additive).
- **Draft save vs discard route shape.** Match whichever the workflow admin routes use (PATCH-with-null
  vs a `/draft` DELETE) at t-3 build time — a small consistency call, not a design decision.

## Done when (feature)

An admin can create a facilitation graph, save a draft, publish it to an immutable versioned snapshot,
read the published map back (typed), and roll back — all through `/api/v1/admin/framework/maps/**`,
every mutation audit-logged, every publish gated by format validation, the whole path proven end-to-end
by integration tests — **with a fresh fork booting to an empty graph table, nothing to strip.** No
upstream Sunrise issue (second pure framework-tier feature). The `validatePublishableMap` chain and
`getPublishedMap` read are shaped as the seams `f-engine` extends.

## References

- [[plan#04 · `f-map` — facilitation map|plan.md feature 04]] — parent.
- [[framework-architecture#5.1 The Map — authored structure|spec §5.1]] + §5.3 / §5.5 / §5.6 / §7,
  Appendix A (F1–F5, F8, F19, X1, X6).
- [[f-module-core]] — the sibling pure framework-tier feature; the admin-namespace + test-split patterns.
- [[f-bootstrap]] — the boundary (t-2) and three-tier / fork-first conventions this builds on.
- [[building-a-feature]] — the execution rhythm.
- [[planning-retro]] — fold f-map's execution lessons here (§B) as they surface.
</content>

</invoke>

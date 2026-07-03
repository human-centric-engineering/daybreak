---
name: f-module-core
feature: 03 · f-module-core
epic: Framework v1
status: shipped (t-1 #10 · t-2 #11 · t-3 #12)
owner: Simon Holmes
depends_on: f-bootstrap (shipped — t-0 #4 / t-1 #6 / t-2 #8 / t-3 #9)
spec: framework-architecture.md §4 (Modules) + Appendix A (A3 / A4 / A5 / A9 / A10 / X1) + Appendix C (C1)
parent: plan.md
opened: 2026-07-02
---

# f-module-core — module definition, registry & liveness

> Feature-level build plan for **`f-module-core`**, the code-first module spine.
> Parent: [[plan#03 · `f-module-core` — module definition, registry & liveness|plan.md]].
> Binding _how_: [[framework-architecture#4. Modules|§4]] + the module decisions in Appendix A
> (A3 code-first · A4 Zod config · A5 computed liveness · A9 event-stream stats · A10 `ModuleVersion`)
> and X1 (free-form `String` status). Sizing follows the parent plan: **task = one PR** (~200–600
> lines, cohesive, reviewable); commits sit below this resolution.

## Intent

Stand up the **code-first module backbone** (spec §4): a `ModuleDefinition` in code declares a
module's identity and config schema; a `framework_module` DB row holds only what an operator
controls. Registration syncs code → row by slug at boot; **liveness is computed, never stored**
(status × flag × window — A5), with journey-gating deliberately left to a later layer (§5). This is
the spine features 06–08 hang off (`f-module-config` versions the config, `f-module-bindings` binds
agents/capabilities/workflows, `f-engagement` adds the event stream).

**What ships here, and what deliberately does not.** In scope: the `ModuleDefinition` type, the
`registerModule()` seam + in-memory registry, the `Module` model, boot-time set-based sync with
`isRegistered` handling, and pure `isModuleLive()`. **Out of scope** (owned by the features that
consume them, so no dead fields land early): `ModuleVersion` / config history (A10 → f-module-config),
the binding pivots + `agentRoles` / `capabilities` (A6/A8 → f-module-bindings), `slotDefinitions`
(§6 → f-slots), and the `JourneyEvent` stream + stats (A9 → f-engagement). `ModuleDefinition` grows
those fields _in the feature that reads them_, never as unused surface here.

## The first pure framework-tier feature — no upstream issue

`f-bootstrap` filed two Sunrise issues (#382 ESLint/CI seams, #385 boot seam) because it built
seams _in_ Sunrise-owned files. **`f-module-core` touches no Sunrise core seam.** Every piece —
`ModuleDefinition`, `registerModule()`, the registry, `framework_module`, sync, `isModuleLive()` —
lives in the **framework tier** (`lib/framework/modules/`) and only consumes f-seams that already
shipped (v0.5.0). Nothing here belongs upstream, so **this feature files no upstream issue** and
carries no cross-repo follow-up. It's the first feature built entirely inside the Daybreak layer;
later features (`f-module-bindings` populating `CapabilityContext.scope`) re-touch the shipped
scope seam, but even that is _consuming_ a generic core carrier, not extending core.

## Reconciliation with current repo reality — the three forkability decisions

The organising principle across all three: **ship nothing a fork has to delete.** A `git fork` of
Daybreak must boot clean — empty modules table, one empty leaf boot hook, zero example rows — while
every layer is proven by tests. Decided 2026-07-02 (see [[plan#Decisions log|plan.md decisions log]]):

1. **Demo module is tests-only — no live registration.** The spec's indicative t-4 ("a trivial demo
   module registered through the seam") must _not_ become a permanent `demo` row every leaf fork
   inherits and must strip. Instead the seam is proven by tests that register a fixture
   `ModuleDefinition` through the _real_ `registerModule()`, run the _real_ `syncRegisteredModules()`,
   and assert the upsert SQL shape + the code-removed → `isRegistered=false` transition. **House
   test-style note (repo reconciliation, per B2):** vitest runs on `happy-dom` with **no live DB** —
   tests mock `@/lib/db/client` and forward `executeTransaction` to a prisma `tx` mock (real-DB
   verification is via `smoke:*` scripts, not vitest). So the "integration" proof is a mocked-prisma
   unit test asserting the exact `upsert`/`updateMany` calls — deterministic, CI-runnable, and it
   still exercises the real registry + real sync code. A fresh Daybreak/leaf boots with an **empty**
   modules table — the correct clean slate.

2. **Admin visibility is a read API, not a page.** API-first (CLAUDE.md) and backend-only for now
   (spec §4.4): ship `GET /api/v1/admin/framework/modules` (the first `app/api/v1/admin/framework/`
   route — a boundary-covered framework path) and defer the module _list page_ to `f-ops-views`
   (feature 15), which owns the real admin UI. The t-4 integration test asserts end-to-end against
   the endpoint; no page is built to render an (empty) list.

3. **Leaf registers modules from the single `initLeafApp()` hook — no per-concern leaf scaffold.**
   The spec literally named a dedicated `lib/app/modules.ts` + `initAppModules()` (mirroring
   `lib/app/capabilities.ts`). But that pattern doesn't scale a growing framework (modules, then
   slots, maps, bindings each wanting a scaffold) and multiplies the leaf surface + `initApp()`
   orchestration. The forkable shape is **one leaf boot hook, many framework `registerX()`
   functions**: the leaf fills exactly one file — the t-3 `initLeafApp()` — and calls the framework's
   exported `registerModule(...)` from it; `initApp()`'s shape stays **fixed**
   (`initFramework()` → `initLeafApp()` → `syncFramework()`) so the t-3 bridge never churns as
   features land. This deviates from the spec's `lib/app/modules.ts` naming — recorded here as a
   reconciliation, the same way f-bootstrap logged its three.

Concrete reuse anchors found in-tree:

- **`ModuleSlug`** already exists in `lib/framework/shared/scope.ts` — `ModuleDefinition.slug` reuses
  it, not a fresh string alias.
- **Registry precedent:** `lib/orchestration/capabilities/registry.ts` — an in-memory `Map` keyed by
  slug, idempotent per-slug `register()` (HMR/repeat-import safe). The module registry mirrors this
  shape (a pure `Map<slug, ModuleDefinition>`, no DB at registration time).
- **Boot chain (t-3):** `instrumentation.ts` → `initApp()` (`lib/app/bootstrap.ts`, Daybreak-filled)
  → `initFramework()` then `initLeafApp()`. `f-module-core` adds a **third** step,
  `syncFramework()`, _after_ `initLeafApp()` so the leaf's registrations are present before the DB
  sync. `initApp` is the one file allowed to see both tiers, so it owns this sequencing.
- **`framework-modules.prisma`** is the empty skeleton (header + `@@map` convention only, from
  f-bootstrap t-1) — the `Module` model lands here.
- **`executeTransaction(work, { timeout })`** (`lib/db/utils.ts`) carries the #368 tx-options
  ceiling the boot-time bulk upsert needs — confirmed present in v0.5.0. Prefer `createMany`/batched
  writes first; reach for a raised `timeout` only if a real fork's module count makes it necessary.

## Tasks (promoted)

| ID  | Task                                                                                                                                   | Files                                                                                                                                                                                                                                       | Deps | Status   | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- | --- |
| t-1 | **Registration → row**: `ModuleDefinition` + `registerModule()` + registry + `Module` model + boot sync + `isRegistered` (+ this plan) | `lib/framework/modules/{definition,registry,sync,index}.ts`, `lib/framework/index.ts`, `lib/app/bootstrap.ts`, `prisma/schema/framework-modules.prisma`, `framework_…` migration, `tests/…`, `.context/framework/planning/f-module-core.md` | —    | **done** | #10 |
| t-2 | **Liveness**: pure `isModuleLive(module, flags, now)` (A5) + entitlement-predicate seam (C1)                                           | `lib/framework/modules/{liveness,status}.ts`, `tests/…`                                                                                                                                                                                     | t-1  | **done** | #11 |
| t-3 | **Admin read API**: `GET /api/v1/admin/framework/modules` + end-to-end visibility proof                                                | `lib/framework/modules/queries.ts`, `app/api/v1/admin/framework/modules/route.ts`, `tests/integration/{api/v1/admin/framework/modules,lib/framework/modules}/*`                                                                             | t-1  | **done** | #12 |

t-2 and t-3 parallelise once t-1 lands. **Three PRs** — one under the parent plan's `~4 PRs`
estimate, after folding the original commit-sized registry-only task into its sync (per
[[planning-retro#B1 · Sizing self-check when promoting tasks]]:
a registry with nothing writing rows is inert scaffolding, so it ships with the sync that gives it a
reason to exist).

### t-1 · Registration → row — the code→registry→row vertical

The whole of A3 in one cohesive PR: a module declared in code becomes a `framework_module` row.
Folds the original "registry seam" and "model + sync" tasks together (retro B1). Also carries this
plan doc.

**Code half (registry, pure, DB-free):**

- **`lib/framework/modules/definition.ts`** — the `ModuleDefinition` type: `slug: ModuleSlug`
  (reused from `shared/scope.ts`), `name`, `description`, and `configSchema` (a Zod schema; the A4
  move — the admin form renders generically from it, and the API validates config with the _same_
  schema). Fields owned by later features (`capabilities`, `slotDefinitions`, `events`, `agentRoles`)
  are **not** added here — they arrive with the feature that consumes them.
- **`lib/framework/modules/registry.ts`** — a module-scoped `Map<string, ModuleDefinition>` plus
  `registerModule(def)` (idempotent by slug — re-registration replaces, mirroring the capability
  registry so HMR/repeat-import is safe) and `getRegisteredModules()`. No DB, no side effects beyond
  the map; the boot-time DB write is `syncFramework()` below, kept a separate function so
  registration stays pure and unit-testable even though it ships in the same PR.
- **`lib/framework/modules/index.ts`** — barrel re-exporting the public seam (`registerModule`,
  `getRegisteredModules`, `ModuleDefinition`) so the leaf imports `@/lib/framework/modules`, not deep
  paths.

**DB half (model + sync that reconciles code → row):**

- **`prisma/schema/framework-modules.prisma`** — `model Module` with only this feature's fields:
  `id`, `slug @unique`, `name`, `status String @default("draft")` (free-form per **X1** — no Prisma
  enum; a raw-SQL `CHECK` only if we later want to constrain it, following
  `orchestration-knowledge.prisma`), `featureFlagName String?`, `availableFrom DateTime?`,
  `availableUntil DateTime?`, `audience String @default("all")`, `config Json @default("{}")`,
  `isRegistered Boolean @default(true)`, `createdAt` / `updatedAt`, `@@index([status])`,
  `@@map("framework_module")`. **No** `configHistory` / `ModuleVersion` relation / binding relations
  yet (their owning features add them). Clean unprefixed model name, `framework_`-prefixed table.
- **Migration** — a single `framework_…`-named migration touching only `framework_*` tables (the
  boundary-hygiene CI keys on this). First real framework DDL: authored with
  `prisma migrate dev --create-only` then reviewed, per the migration-drift guard.
- **`lib/framework/modules/sync.ts`** — `syncRegisteredModules()`: reconcile the registry into rows
  inside `executeTransaction` (`{ timeout }` headroom via #368), **set-based** (not a per-slug upsert
  loop — that would rewrite every row every boot and churn `updatedAt`; caught in t-1 code review).
  Three guarded statements: `createMany({ …, skipDuplicates: true })` writes code-owned data
  (`slug`/`name`) for **new** rows only; `updateMany({ slug in code, isRegistered: false })` re-flags
  a reappeared slug; `updateMany({ slug notIn code, isRegistered: true })` retires removed rows
  (`isRegistered=false`, never deleted — audit). Both updates are guarded by an `isRegistered`
  mismatch, so a **no-change boot writes zero rows** and never bumps `updatedAt` (operator columns
  preserved). **An empty registry returns early — a true no-op, never a mass-unregister** (an empty
  registry can't be told apart from "registration didn't run", so the destructive branch is skipped;
  this also means `notIn` never sees `[]`). Idempotent — safe to re-run every boot.
- **`lib/framework/index.ts`** — add `syncFramework()` (async), which today runs
  `syncRegisteredModules()` and is the single stable entry `initApp()` calls; later features add
  their own sync passes _inside_ it, so `initApp` never changes again.
- **`lib/app/bootstrap.ts`** — `initApp()` gains the third step: `initFramework()` → `initLeafApp()`
  → `await syncFramework()`, wrapped in the same **log-don't-throw** resilience as **f-bootstrap t-3**
  (the boot seam): a DB-down boot must not crash `instrumentation.register()` or disarm the dev
  ticker; a fork with no modules syncs an empty registry — a no-op.
- **`onDelete` note:** `framework_module` has no `userId`/`createdBy` FK yet, so the new-User-relation
  cascade rule doesn't bite here. When bindings/journey rows arrive with user FKs (later features),
  they declare `onDelete` per the privacy rule.
- **Proof test (register → row):** a mocked-prisma test (house style — see the reconciliation note
  above) registers a fixture `ModuleDefinition` through the real `registerModule()`, runs the real
  `syncRegisteredModules()`, and asserts the exact SQL shape: `createMany` with `slug`/`name` only
  (no operator columns) and `skipDuplicates`; the re-register and retire `updateMany`s each guarded by
  an `isRegistered` mismatch; the **empty-registry no-op** (no transaction, no writes); and the
  `registered`/`retired` log counts. The fixture lives in `tests/` (decision 1 — tests-only, nothing
  a fork strips).
- **Done when:** migration applies clean and passes the drift-check (Prisma's spurious `DROP INDEX`
  for the unmodelled pgvector/tsvector objects stripped); `registerModule()` is idempotent by slug
  (unit test); `syncRegisteredModules()` reconciles set-based, preserves operator columns, writes zero
  rows on a no-change boot, no-ops on an empty registry, and flips `isRegistered` on code removal
  (mocked-prisma unit test); boot sync is resilient (bootstrap unit
  test: framework init throw AND sync throw → logged, not rethrown, leaf still runs); **gates green —
  `/pre-pr` then `/code-review`, both run before opening the PR** (retro B4).

### t-2 · Pure module liveness + entitlement seam (C1)

A5 as a pure function — the "is it on at all?" question, kept out of the "is it open to this user?"
(journey) layer.

- **`lib/framework/modules/liveness.ts`** — `isModuleLive(module, flags, now, entitlement?)`,
  **pure** (takes resolved inputs, exactly as the facilitation engine takes `now` — no DB, no clock,
  no flag-lib reach-in, so it's exhaustively unit-testable):
  - `status` must equal the active constant (compared as a free-form string, X1);
  - if `featureFlagName` is set, `flags[featureFlagName]` must be `true` (caller resolves flags to a
    `Record<string, boolean>` via Sunrise's existing flag lib);
  - `now` must fall within `[availableFrom, availableUntil]` (either null = open-ended);
  - **entitlement predicate (C1)** — an _optional_ 4th input; when supplied it must return `true`.
    This is the "earliest-relevant interface — touches Phase 1" from Appendix C: a paid tier is a
    fourth liveness input, so the signature reserves the seam now (same "shape it now, wire it later"
    discipline as `canRead`), and omitting it means "no entitlement gating," the single-tier default.
  - Returns an **explainable** discriminated union — `{ live: true } | { live: false; reason:
'status' | 'flag' | 'window' | 'entitlement' }` — so admin/guidance surfaces can say _why_ a
    module is dark, and a caller can only read `reason` once it has checked `live` is false.
- **Permutation tests** across status × flag × window × entitlement (present/absent), including
  boundary instants on the window.
- **Done when:** `isModuleLive` is pure and total; the permutation matrix passes; the entitlement
  arg is proven optional (absent ⇒ single-tier behaviour unchanged); **gates green — `/pre-pr` then
  `/code-review`, both before opening the PR** (retro B4).

### t-3 · Admin read API — end-to-end visibility proof

The "see it" half of the vertical: exposes the `framework_module` rows through the first framework
admin route, proving registration → row → admin visibility without shipping anything a fork strips
(decisions 1 + 2).

- **`lib/framework/modules/queries.ts`** — `listModules()`: the read side, `prisma.module.findMany({
orderBy: { slug: 'asc' } })`. Separated from `sync.ts` (write side) so admin/ops surfaces share one
  testable data fn, mirroring how Sunrise admin routes delegate reads to a lib fn (`getAllFlags`). The
  `Module` type is imported straight from `@prisma/client` — **not** re-exported through core
  `types/prisma.ts`, which stays free of framework vocabulary (X6). Does not swallow errors into `[]`.
- **`app/api/v1/admin/framework/modules/route.ts`** — `GET`, guarded by `withAdminAuth()` (auth only —
  the `/api/v1/**` section rate-limit is applied by `proxy.ts`, not the guard, so no handler limiter is
  needed for a read), returns `listModules()` via
  `successResponse()`. **First route under `app/api/v1/admin/framework/`** — establishes the framework
  admin-API namespace, and is the first file to actually exercise the X6 ESLint glob
  `app/api/v1/admin/framework/**` as _framework tier_ (it imports `@/lib/framework/*`; flat-config
  last-match-wins over the core→framework ban — verified green). Rows already carry `isRegistered`
  (set by sync), so the endpoint just reads them.
- **Two test files** (split to keep the boundary clean — the contract test needs no `@/lib/framework`
  import, so it lives at the conventional API path; the e2e imports framework fns, so it lives at the
  boundary-exempt `tests/**/lib/framework/**` path):
  - `tests/integration/api/v1/admin/framework/modules/route.test.ts` — HTTP contract: admin-guarded
    (401 unauth / 403 non-admin, DB untouched), 200 returns rows in the envelope ordered by slug, `[]`
    on the clean-fork empty state. Mocks Prisma + auth.
  - `tests/integration/lib/framework/modules/registration-visibility.test.ts` — **end-to-end**
    (decision 1): the _real_ registry → `syncRegisteredModules` → `listModules` chain against a small
    **stateful in-memory Prisma fake** (create/update mutate a store, findMany reads it), proving
    register → row → visible, retire-on-removal (`isRegistered=false`, row retained), and re-register.
    The tests-only fixture lives here — nothing a fork strips.
- **Done when:** the endpoint returns admin-guarded module rows in the standard envelope; a fresh tree
  returns `[]` (clean fork state); the e2e drives the real register → sync → read chain green; the
  boundary CI stays green with the new framework admin path; **gates green — `/pre-pr` then
  `/code-review`, both before opening the PR** (retro B4).

## Boundary & forkability notes

- **Everything is framework-tier.** All new `lib/framework/modules/**` code imports core only through
  public seams; the boundary CI (f-bootstrap t-2) covers it in both directions. The one cross-tier
  touch is `lib/app/bootstrap.ts` calling `syncFramework()` — already the sanctioned bridge
  (`lib/app/**` is boundary-exempt as the leaf/boot surface).
- **Leaf surface stays minimal.** No new `lib/app/*` scaffold. A leaf fork's entire module story is:
  fill `initLeafApp()`, call `registerModule(myModule)`. One file, no stripping, and it doesn't grow
  a scaffold per future framework concept.
- **`initApp()` shape is frozen** at `initFramework()` → `initLeafApp()` → `syncFramework()`. Future
  features extend `syncFramework()` (framework-owned), not the f-bootstrap boot bridge.

## Open questions

- **Boot-time sync on serverless cold start.** `syncRegisteredModules()` runs in
  `instrumentation.register()` on every cold start. For Lelanea-scale (a handful of modules) the
  idempotent upsert is negligible and #368 gives timeout headroom; accepted. Revisit only if a fork's
  module count grows large — at which point a "sync only when the registry hash changed" guard, or an
  explicit admin-triggered sync, is the escape hatch. Not blocking.
- **`config` validation on write is not in this feature.** The row's `config Json` is stored as-is by
  sync (code doesn't set operator config). Validating an operator's config edit against the module's
  `configSchema` is `f-module-config`'s job (the generic admin form + API). t-4's read API does not
  mutate config.
- **`status` constant vocabulary.** Ship the minimal `draft` / `active` set the liveness check needs;
  `scheduled` / `retired` (sketched in §4.1) are additive later (free-form string, X1 — no migration
  to add a value). Confirm the active-state constant name when building t-3.

## Done when (feature)

`registerModule()` registers module definitions in code; boot syncs them to `framework_module` rows
by slug (operator columns preserved, `isRegistered` reflecting code presence); `isModuleLive()`
computes liveness purely with the entitlement seam reserved; the admin read API exposes the rows; and
the whole path is proven end-to-end by integration tests — **with a fresh fork booting to an empty
modules table, nothing to strip.** No upstream Sunrise issue (first pure framework-tier feature).

## References

- [[plan#03 · `f-module-core` — module definition, registry & liveness|plan.md feature 03]] — parent.
- [[framework-architecture#4. Modules|spec §4]] + Appendix A (A3/A4/A5/A9/A10), Appendix C (C1), X1.
- [[f-bootstrap]] — the boot chain (t-3), boundary (t-2), and the three-tier / fork-first conventions this feature builds on.
- [[planning-retro]] — fold feature-plan-authoring lessons here as they surface (§B).

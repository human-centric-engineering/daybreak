---
name: f-slots
feature: 05 · f-slots
epic: Framework v1
status: in flight (t-1 / t-2 / t-3 promoted)
owner: John
depends_on: f-bootstrap (shipped — #4 / #6 / #8 / #9) · f-module-core (shipped — #10 / #11 / #12, for the `ModuleDefinition.slotDefinitions` seam)
spec: framework-architecture.md §6 (Data-Slots) + Appendix A (D1 / D2 / D3 / D4 / D5 / D6 / A2 / X1 / X2)
parent: plan.md
opened: 2026-07-03
---

# f-slots — slot definitions + insert-only values

> Feature-level build plan for **`f-slots`**, the Data-Slots layer.
> Parent: [[plan#05 · `f-slots` — slot definitions + values|plan.md]].
> Binding _how_: [[framework-architecture#6. Data-Slots — lightweight sketch|§6]] + the slot
> decisions in Appendix A (D1 insert-only versioned values · D2 `dataType`/`valueJson` · D3
> `sensitivity` · D4 `supersededAt` head-read denormalisation · D5 capture-as-capabilities · D6
> `AiUserMemory` left untouched) and A2 (definition-vs-state) / X1 (free-form `String`, no Prisma
> enums) / X2 (`canRead`). Sizing follows the parent plan: **task = one PR** (~200–600 lines,
> cohesive, reviewable); commits sit below this resolution.

## Intent

Stand up the **Data-Slots** layer (spec §6): what the system learns about the user. Two sides,
one table each. **Slot definitions** are authored configuration — _what_ the system aims to learn
(a slot's meaning, scope, data type, sensitivity). **Slot values** are runtime user data — _what_
it has learned: insert-only, versioned, each row carrying confidence, source type, and per-version
provenance that links back to the conversation archive. This is the data the facilitation spine
reads: `f-engine` gates on typed slot values, `f-guidance` ranks on recency-weighted slot heads.
Alongside `f-map` it sits at the head of the critical path.

**What ships here, and what deliberately does not.** In scope: the `SlotDefinition` model + the
free-string vocabulary; **module-declared** slot registration (`slotDefinitions` on
`ModuleDefinition`, upserted set-based at boot, scope-stamped `module:<slug>`); the `SlotValue`
insert-only model with its `supersededAt` head-read denormalisation, the hand-FK cascade + erasure
proof; the pure **insert-only value engine** (`appendSlotValue` / `getSlotHeads`); and a slot-definition
admin read API. **Out of scope** (owned by the features that consume them, so no dead surface lands
early): the `fill_slot` / `get_state` **capabilities** with PII handling, sensitivity-masking,
structured-output schema forwarding (#307), open-mode slug minting, and per-grant selective exposure
(D5 → **f-slot-capture**, feature 10); the `canRead(viewer, subject, scope)` access predicate slot
reads will route through (X2 → **f-journey-state**, feature 09); the slot admin _page_ and any
value/ops read surface (→ **f-ops-views**, feature 15); and everything on the slot deep-design agenda
(capture-loop placement, write policy, masking rules per class, open-mode curation — [[framework-architecture#9. Open items|§9 item 1]]).

## The slot deep-design is deferred — this is the Phase-3 sketch, not the capture loop

The spec is explicit ([[framework-architecture#6. Data-Slots — lightweight sketch|§6 header]]):
§6 is "deliberately a sketch — the shape the other two layers need to exist," and the schemas are
shaped so the dedicated slot deep-design pass ([[framework-architecture#9. Open items|§9 item 1]],
OPEN — _sequenced, not contentious_) "changes capture _behaviour_, not these schemas." So `f-slots`
builds the **stable schemas + the mechanical value engine + module-declared registration**, and
leaves the _behavioural_ capture mechanics (in-loop vs post-turn extraction, version-every-change vs
meaningful-changes-only, provenance surfacing, per-sensitivity masking, open-mode slug
curation/promotion) to that later pass. The field-level comments in the §6 sketch are themselves
binding spec text and are adopted verbatim.

## Another pure framework-tier feature — no upstream issue

Like [[f-module-core]], `f-slots` touches **no Sunrise core seam**. Every piece — the two models,
the registry/sync, the value engine, the admin read route — lives in the **framework tier**
(`lib/framework/data-slots/**`, `prisma/schema/framework-data-slots.prisma`,
`app/api/v1/admin/framework/**`) and only consumes seams that already shipped. The single edit
outside `data-slots/` is adding `slotDefinitions?` to `lib/framework/modules/definition.ts` — a
_framework_ file, and exactly the field [[f-module-core]] deferred ("`slotDefinitions` (§6 →
f-slots)"). The one cross-tier reference is the framework→core FK `framework_slot_value.userId →
"User"`, which the boundary CI explicitly allows (`scripts/boundary/lib.ts`: "a framework→core FK
is allowed — hygiene is about DDL ownership, not the FK graph"). Nothing here belongs upstream, so
**this feature files no upstream issue.**

## Reconciliation with current repo reality — the forkability decisions

Organising principle, carried from [[f-module-core]]: **ship nothing a fork has to delete.** A
`git fork` of Daybreak boots to **empty** slot tables (Daybreak declares zero slots; leaf apps
declare their own), while every layer is proven by tests. Decisions (2026-07-03):

1. **Value engine ships in `f-slots`, not `f-slot-capture`.** `f-slots` ships the pure insert-only
   value engine — `appendSlotValue()` (compute next version + supersede the prior head, one
   transaction) and `getSlotHeads()` (`WHERE supersededAt IS NULL`). `f-slot-capture` (10) then
   wraps these in the `fill_slot` / `get_state` `BaseCapability`s with the PII/masking/schema-forwarding/
   open-mode/selective-exposure behaviour (D5). Rationale: consistent with [[f-module-core]], which
   shipped `sync` + `queries` alongside the `Module` table rather than a bare model — a table nothing
   reads or writes is the inert scaffolding [[planning-retro#B1 · Sizing self-check when promoting tasks|B1]]
   warns against. The board's indicative t-2 ("SlotValue insert-only … + erasure hooks + cascade")
   named the model; the mechanical engine that gives it a reason to exist ships with it, while the
   _capability_ surface (validation, masking, minting, exposure) is genuinely additional and stays in
   feature 10. **`processesPii` / `redactProvenance` are capability-registration concerns — they live
   on the `fill_slot` capability, not on this model** (D5, §6.2). _(Owner may revisit on review; if
   reversed, t-2 becomes table-only and the engine moves to f-slot-capture.)_
2. **Registration is module-declared only.** Slots come from `ModuleDefinition.slotDefinitions`,
   scope-stamped `module:<slug>` at collection, upserted set-based into the one
   `framework_slot_definition` table (§6.1: definitions "come from two sources that land in one
   table"). The spec's other source — app-seeded **global** slots — is an **additive**
   `registerGlobalSlotDefinitions()` seam a leaf adds when it needs non-module slots; not built now,
   so nothing inert lands. This matches the board's t-3 scope (module-declared) and
   [[f-module-core]] reconciliation #3 (leaf registers from `initLeafApp()`, no per-concern scaffold).
3. **Admin visibility is a read API, not a page.** Ship `GET
/api/v1/admin/framework/slot-definitions` (API-first; the second route under the framework
   admin-API namespace [[f-module-core]] opened) and defer the slot _list page_ to `f-ops-views`
   (15). Exactly [[f-module-core]] decision #2. (No admin _value_ read here — per-user value/ops
   surfaces are `f-ops-views`; values are read in-process via `getSlotHeads`.)
4. **`SlotDefinition` carries house-convention `createdAt` / `updatedAt`.** The §6 sketch omits
   them, but every Sunrise model has them and the no-churn boot-sync guarantee (B8) needs
   `updatedAt` to stay meaningful (an operator-audited config table). The sketch is explicitly
   "shape and rationale, not migration-ready," so this house-convention addition is expected.
5. **`SlotValue.userId` is a plain `String` FK, no Prisma `@relation`.** Per
   [[data-erasure|.context/privacy/data-erasure.md]]: a fork table must not add a reverse relation
   to the core `User` model (a merge-prone core edit). The `ON DELETE CASCADE` is **hand-written in
   the migration SQL** — Prisma won't emit it. The migration-drift check flags that one line;
   expected and required.

Concrete reuse anchors found in-tree:

- **The empty skeleton** — `prisma/schema/framework-data-slots.prisma` (header + convention only,
  from f-bootstrap t-1). f-slots fills it; no new schema file.
- **`ModuleSlug`** — `lib/framework/shared/scope.ts`; the `module:<slug>` scope reuses the same slug
  that keys `Module.slug` and namespaces module capabilities (`module-slug.tool`, A8).
- **Set-based boot sync** — `lib/framework/modules/sync.ts` is the exact pattern to mirror:
  `createMany({ skipDuplicates })` + `isRegistered`/`isActive`-guarded `updateMany`s + empty-registry
  no-op, inside `executeTransaction(work, { timeout })`. Slot-definition sync is the same three-statement
  shape keyed on `isActive`.
- **Insert-only versioned precedent** — `AiWorkflowVersion` / `AiAgentVersion`
  (`prisma/schema/orchestration-workflows.prisma`): `version Int` monotonic per parent,
  `@@unique([parentId, version])`, rows never mutated. `SlotValue` differs only in head-tracking: no
  parent "slot instance" row, so the head is `supersededAt IS NULL` (D4 denormalisation) rather than a
  forward pointer.
- **`AiUserMemory`** (`orchestration-conversations.prisma`) — the closest analog (per-user learned
  data, `onDelete: Cascade`). This system supersedes it for framework apps (D6); leave it untouched.
- **`syncFramework()` / `initFramework()`** — `lib/framework/index.ts`. f-slots adds
  `syncRegisteredSlotDefinitions()` _inside_ `syncFramework()`; `initApp()`'s frozen shape
  (`initFramework()` → `initLeafApp()` → `syncFramework()`) never changes.
- **Admin read route + two-test split** — `app/api/v1/admin/framework/modules/route.ts` and its
  `route.test.ts` (contract, no framework import) + `registration-visibility.test.ts` (e2e, stateful
  in-memory Prisma fake). Copy both patterns.
- **Erasure** — `lib/privacy/erase-user.ts` (cascade via `tx.user.delete()`; hooks only for external
  resources / `SET NULL` residual PII — neither applies to `SlotValue`); `scripts/smoke/erasure.ts`
  is where the real-DB "rows gone after erasure" assertion lands.

## Test strategy (vitest — no live DB) — stated up front (B9)

Vitest runs on `happy-dom` with **no live DB**. Every DB test here:

- **mocks `@/lib/db/client`** and **forwards `executeTransaction` to a `tx` mock** (`async (cb) =>
cb(prismaFake)`), so the real sync/engine code's `tx.slotDefinition.*` / `tx.slotValue.*` calls hit
  the mock;
- asserts the **query/`tx` shape** for unit tests (e.g. `createMany` with code-owned fields +
  `skipDuplicates`; the guarded `updateMany`s; `appendSlotValue`'s find-head → supersede → insert
  sequence);
- proves the **register → sync → list chain** with a **stateful in-memory Prisma fake** over a
  `Map` store (copy `tests/integration/lib/framework/modules/registration-visibility.test.ts`
  verbatim in shape — `vi.hoisted` fake, `matches(row, where)` honouring `in`/`notIn`/`isActive`,
  dynamic `await import` of the real code _after_ the mocks, `__reset…ForTests()` in `beforeEach`);
- uses a **`smoke:*` script** for real-DB fidelity — here `scripts/smoke/erasure.ts` proves
  `framework_slot_value` rows are gone after `eraseUser()`.

Never "integration test against the dev DB" in vitest.

## Tasks (promoted)

| ID  | Task                                                                                                                                   | Files                                                                                                                                                                                                                                                                | Deps | Status    | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | --- |
| t-1 | **Slot definitions**: `SlotDefinition` model + vocabulary + module-declared registration + set-based boot sync + queries (+ this plan) | `prisma/schema/framework-data-slots.prisma`, `lib/framework/data-slots/{vocabulary,definition,sync,queries,index}.ts`, `lib/framework/modules/definition.ts`, `lib/framework/index.ts`, `framework_…` migration, `tests/…`, `.context/framework/planning/f-slots.md` | —    | available | —   |
| t-2 | **Slot values**: `SlotValue` insert-only model + value engine (`appendSlotValue` / `getSlotHeads`) + hand-FK cascade + erasure proof   | `prisma/schema/framework-data-slots.prisma`, `lib/framework/data-slots/{values,index}.ts`, `framework_…` migration, `scripts/smoke/erasure.ts`, `tests/…`                                                                                                            | t-1  | backlog   | —   |
| t-3 | **Admin read API**: `GET /api/v1/admin/framework/slot-definitions` + contract test                                                     | `app/api/v1/admin/framework/slot-definitions/route.ts`, `tests/integration/api/v1/admin/framework/slot-definitions/route.test.ts`                                                                                                                                    | t-1  | backlog   | —   |

t-2 and t-3 parallelise once t-1 lands. **Three PRs**, matching the parent plan's `~3 PRs` estimate
and mirroring [[f-module-core]]'s shape (code→row / value vertical / →visible). The board's
indicative "SlotDefinition model" task is folded into t-1's registration+sync vertical — a bare
model with nothing writing rows is the exact commit-sized sliver
[[planning-retro#B1 · Sizing self-check when promoting tasks|B1]] says to fold; the two
definition-sources (app-seed, module-declared) are one sync mechanism, not two PRs.

### t-1 · Slot definitions — the code → row vertical

A slot declared in a module's `slotDefinitions` becomes a `framework_slot_definition` row, scoped
`module:<slug>`. Also carries this plan doc.

**Schema + vocabulary (code, pure):**

- **`prisma/schema/framework-data-slots.prisma`** — fill the skeleton with `model SlotDefinition`
  per §6.1: `id String @id @default(cuid())`, `slug String @unique`, `group String` (thematic
  cluster), `description String @db.Text` (meaning — also prompt material), `scope String
@default("global")` (`global | module:<slug> | facilitation`), `visibility String @default("open")`
  (`open | hidden`), `mode String @default("targeted")` (`targeted | open`), `dataType String
@default("text")` (`text | number | boolean | date | json`), `sensitivity String
@default("standard")` (`standard | sensitive | special_category`), `priorityWeight Int
@default(0)`, `isActive Boolean @default(true)`, `createdAt` / `updatedAt`; `@@index([group,
scope])`; `@@map("framework_slot_definition")`. Every status/type field is free-form `String`
  (X1 — no Prisma enum; the allowed-value set lives in the comment + `vocabulary.ts`).
- **`lib/framework/data-slots/vocabulary.ts`** — `as const` objects `SLOT_SCOPE`,
  `SLOT_VISIBILITY`, `SLOT_MODE`, `SLOT_DATA_TYPE`, `SLOT_SENSITIVITY` + their derived union types,
  mirroring `modules/status.ts`. Free-string, so a new value is not a migration.
- **`lib/framework/data-slots/definition.ts`** — `SlotDefinitionInput`, the authored shape a
  module declares (`slug`, `group`, `description`, and optional `visibility` / `mode` / `dataType` /
  `sensitivity` / `priorityWeight` typed off `vocabulary.ts`; **no `scope`** — the sync stamps it).
- **`lib/framework/modules/definition.ts`** — add `slotDefinitions?: SlotDefinitionInput[]` to
  `ModuleDefinition` (the one edit to a module-owned file; the field [[f-module-core]] deferred).

**Registration + sync (reconciles code → row):**

- **`lib/framework/data-slots/sync.ts`** — `syncRegisteredSlotDefinitions()`: collect every
  registered module's `slotDefinitions` (`getRegisteredModules().flatMap(...)`), **stamp `scope =
"module:" + module.slug`**, dedupe by slug, and reconcile **set-based** inside
  `executeTransaction({ timeout })` — the three-statement shape from module sync, keyed on
  `isActive`: `createMany({ …, skipDuplicates: true })` writes code-owned fields (`slug`, `group`,
  `description`, `scope`, `visibility`, `mode`, `dataType`, `sensitivity`, `priorityWeight`) for
  **new** rows only; `updateMany({ slug in code, isActive: false } → isActive: true)` reactivates a
  reappeared slug; `updateMany({ slug notIn code, isActive: true } → isActive: false)` deactivates
  removed slugs (never deleted — audit). **Empty set returns early — a true no-op, never `notIn:
[]`, never mass-deactivate.** No-change boot writes zero rows, never bumps `updatedAt` (B8).
- **`lib/framework/data-slots/queries.ts`** — `listSlotDefinitions()` →
  `prisma.slotDefinition.findMany({ orderBy: { slug: 'asc' } })`. `SlotDefinition` imported from
  `@prisma/client`, not re-exported through core `types/prisma.ts` (X6). Does not swallow errors
  into `[]`.
- **`lib/framework/data-slots/index.ts`** — barrel: `SlotDefinitionInput`, the vocabulary consts +
  types, `syncRegisteredSlotDefinitions`, `listSlotDefinitions`.
- **`lib/framework/index.ts`** — extend `syncFramework()` to `await
syncRegisteredSlotDefinitions()` after `syncRegisteredModules()`. `initApp()` shape unchanged.
- **Migration** `…_framework_add_slot_definition` — `prisma migrate dev --create-only`, only the
  `framework_slot_definition` table (no `userId`, no hand-FK), strip Prisma's spurious
  pgvector/tsvector `DROP`s per [[prisma-unmodelled-objects|.context/database/prisma-unmodelled-objects.md]].
- **Proof tests (mocked-prisma):** a unit test asserting the sync SQL shape (`createMany` with
  code-owned fields + `skipDuplicates`; the two guarded `updateMany`s; scope-stamped `module:<slug>`;
  the **empty-registry no-op** — no transaction, no writes); and the e2e stateful-fake test at
  `tests/integration/lib/framework/data-slots/registration-visibility.test.ts` driving the real
  register(module with `slotDefinitions`) → `syncRegisteredSlotDefinitions` → `listSlotDefinitions`
  chain, proving `module:<slug>` scope, retire-on-removal (`isActive=false`, row retained), and
  re-register. Fixtures live in `tests/` — nothing a fork strips.
- **Done when:** migration applies clean + passes the drift check; sync is set-based, idempotent,
  no-churn (zero writes on a no-change boot), safe-on-empty (empty set = no-op, never
  mass-deactivate), and scope-stamps `module:<slug>`; a fresh fork lists `[]`; the e2e chain is
  green; **gates green — `/pre-pr` then `/code-review`, both run before opening the PR** (B4).

### t-2 · Slot values — insert-only model + value engine + erasure

The per-user data half: insert-only versioned values with the head-read denormalisation, and the
mechanical engine that writes/reads them.

- **`prisma/schema/framework-data-slots.prisma`** — add `model SlotValue` (`// INSERT-ONLY — never
updated, never deleted (except erasure)`) per §6.1: `id String @id @default(cuid())`, `userId
String` (**plain FK, no `@relation`** — satellite convention + erasure hook), `slotSlug String`
  (definition slug, or minted slug in open mode — **not** an FK to `SlotDefinition`), `version Int`
  (monotonic per `(userId, slotSlug)`), `value String @db.Text` (plain language — canonical for
  conversation), `valueJson Json?` (typed form per `dataType` — canonical for gate conditions &
  analytics), `confidence Int` (1–10), `sourceType String` (`direct | unprompted | emerged_naturally
| built_across_turns | inferred | user_confirmed | synthesised`), `reasoningNote String @db.Text`,
  `provenance Json` (`{ conversationId, messageRange?, moduleSlug?, nodeKey?, capturedAt,
contextExcerptRef? }`), `supersededAt DateTime?` (set on the **previous** head when a new version
  lands — **keep the "deliberate denormalisation … do not simplify this away; head reads are the hot
  path" comment**, D4), `capturedAt DateTime @default(now())`; `@@unique([userId, slotSlug,
version])`; `@@index([userId, capturedAt])` (freshest-slots reads for guidance);
  `@@map("framework_slot_value")`.
- **Migration** `…_framework_add_slot_value` — `--create-only`, only `framework_slot_value`, then
  **hand-add** the referential action Prisma won't emit:
  `ALTER TABLE "framework_slot_value" ADD CONSTRAINT "framework_slot_value_userId_fkey" FOREIGN KEY
("userId") REFERENCES "User"("id") ON DELETE CASCADE;`. Strip Prisma's spurious pgvector/tsvector
  `DROP`s. The drift check flags the hand-FK line — expected (the fork-table pattern).
- **`lib/framework/data-slots/values.ts`** — the insert-only engine:
  - **`appendSlotValue(input)`** — in one `executeTransaction`: read the current head
    (`findFirst({ where: { userId, slotSlug, supersededAt: null } })`); `version = head ? head.version
    - 1 : 1`; if a head exists, `update`its`supersededAt = now`; `create`the new row. Value rows
are never updated (except the`supersededAt`stamp on the outgoing head) and never deleted.
Timestamp comes from the caller / a single`new Date()` at the top of the tx so the supersede and
      the new row agree.
  - **`getSlotHeads(userId, filter?)`** — `findMany({ where: { userId, supersededAt: null,
…filter }, orderBy: { capturedAt: 'desc' } })` — the guidance hot path, served by
    `@@index([userId, capturedAt])`. `filter` admits `scope` / `group` narrowing (open value, so
    later `canRead`-driven scoping composes).
  - Barrel (`index.ts`) exports both.
- **Erasure** — the hand-FK `ON DELETE CASCADE` erases `SlotValue` automatically via `eraseUser()`'s
  `tx.user.delete()`; **no erasure hook needed** (no external resources, no `SET NULL` residual PII).
  `SlotDefinition` has no `userId` — untouched by erasure.
- **`scripts/smoke/erasure.ts`** — add an assertion: seed a `framework_slot_value` row for a test
  user, run `eraseUser()`, assert the row is gone (real-DB proof; [[data-erasure]] step 3).
- **Tests (mocked-prisma):** `appendSlotValue` — version `1` on first write (no head; no supersede
  update); version increment + prior-head `supersededAt` set on the second write; both inside one
  `executeTransaction` (assert the `tx` call sequence). `getSlotHeads` — the `supersededAt: null`
  head filter + `userId` + optional narrowing.
- **Done when:** migration applies with the hand-FK cascade; `appendSlotValue` is insert-only,
  computes monotonic versions per `(userId, slotSlug)`, and supersedes the prior head in a single
  transaction; `getSlotHeads` returns only heads; the erasure smoke assertion passes; **gates green —
  `/pre-pr` then `/code-review`, both before opening the PR** (B4).

### t-3 · Admin read API — slot-definition visibility proof

The "see it" half: expose `framework_slot_definition` rows through the framework admin namespace,
proving registration → row → admin visibility without shipping a page a fork strips (decisions 2 + 3).

- **`app/api/v1/admin/framework/slot-definitions/route.ts`** — `GET`, guarded by `withAdminAuth()`
  (auth only — the `/api/v1/**` section rate-limit is applied by `proxy.ts`, no handler limiter for a
  read), `getRouteLogger(request)` for structured logging, delegates to `listSlotDefinitions()`,
  returns via `successResponse()`. Second route under `app/api/v1/admin/framework/` (framework-tier
  path — imports `@/lib/framework/*`, last-match-wins over the core→framework ban, as
  [[f-module-core]] t-3 verified).
- **Contract test** `tests/integration/api/v1/admin/framework/slot-definitions/route.test.ts` —
  admin-guarded (401 unauth / 403 non-admin, DB untouched), 200 returns rows in the envelope with
  **ordering asserted at the query** (`findMany` called with `{ orderBy: { slug: 'asc' } }`, not
  faked in the mock), `[]` on the clean-fork empty state. Mocks Prisma + auth; **no `@/lib/framework`
  import** (stays at the conventional API path, boundary-clean). The register→sync→visible **e2e**
  already lives in t-1's `tests/…/lib/framework/data-slots/` file.
- **Done when:** the endpoint returns admin-guarded definitions in the standard envelope; a fresh
  tree returns `[]`; the boundary CI stays green with the new framework admin path; **gates green —
  `/pre-pr` then `/code-review`, both before opening the PR** (B4).

## Boundary & forkability notes

- **Everything is framework-tier.** All new `lib/framework/data-slots/**` and
  `app/api/v1/admin/framework/**` code imports core only through public seams; the boundary CI covers
  it both directions. The one cross-tier reference is the `framework_slot_value.userId → "User"` FK,
  explicitly whitelisted (`scripts/boundary/lib.ts`). No edit to the core `User` model, no edit to
  `lib/app/bootstrap.ts` (the `initApp` shape is frozen).
- **Leaf surface stays minimal.** A leaf's slot story is: declare `slotDefinitions` on its module(s)
  and call `registerModule(...)` from `initLeafApp()` — no new `lib/app/*` scaffold. Daybreak itself
  declares zero slots → empty tables, nothing to strip.
- **`syncFramework()` grows, `initApp()` does not.** f-slots adds one sync pass inside
  `syncFramework()`; the f-bootstrap boot bridge is untouched.
- **Migration hygiene.** Two `framework_`-named migrations, each touching only `framework_*` tables
  (the `framework_slot_value` FK _references_ core `"User"` but does not `CREATE`/`ALTER` it — allowed).

## Open questions

- **Value-engine placement (decision 1).** Proceeding with "engine in f-slots" (recommended,
  f-module-core-consistent). Owner to confirm on review; if reversed, t-2 ships table-only and the
  engine moves to `f-slot-capture`.
- **`canRead` (X2) — slot reads.** §6.3 / X2 require journey/slot reads to route through
  `canRead(viewer, subject, scope)`, built in `f-journey-state` (09). `getSlotHeads` here takes
  `userId` directly (single-user Lelanea) with an open `filter` seam; note the seam so
  `f-journey-state` **wraps** it (supplying tier/ownership/scope inputs to the shared predicate), not
  a rewrite. Not built here.
- **Global (app-seeded) slots.** Deferred; an additive `registerGlobalSlotDefinitions()` seam feeding
  the same sync when a leaf needs non-module slots. Not shipped (nothing inert).
- **`slotSlug` has no FK to `SlotDefinition`.** Intentional — open-mode mints slugs with no backing
  definition (§6.1). Validation of a targeted-mode slug against its definition is the `fill_slot`
  capability's job (f-slot-capture), not a DB constraint.
- **Write policy / masking.** Version-every-change vs meaningful-changes-only, and per-sensitivity
  masking-before-storage, are on the slot deep-design agenda (§9 item 1). `appendSlotValue` writes
  every call for now; the capability layer (f-slot-capture) is where masking and any write-policy land.

## Done when (feature)

Module-declared `slotDefinitions` sync to `framework_slot_definition` rows scoped `module:<slug>`
(operator columns preserved, `isActive` reflecting code presence); `appendSlotValue` /
`getSlotHeads` provide the insert-only value engine over `framework_slot_value` (monotonic versions,
`supersededAt` head reads); `SlotValue` erases via the hand-FK cascade (smoke-proven); the admin read
API exposes definitions; and the whole path is proven by mocked-prisma units + a stateful-fake e2e —
**with a fresh fork booting to empty slot tables, nothing to strip.** No upstream Sunrise issue
(pure framework-tier). On the last merge: flip `f-slots` → **shipped**, flip `f-slot-capture` (10)
`blocked → available ▲`, add a Work-completed log line, and append execution lessons to
[[planning-retro]] §B.

## References

- [[plan#05 · `f-slots` — slot definitions + values|plan.md feature 05]] — parent.
- [[framework-architecture#6. Data-Slots — lightweight sketch|spec §6]] + Appendix A
  (D1–D6 / A2 / X1 / X2), and [[framework-architecture#9. Open items|§9 item 1]] (the deferred deep-design).
- [[f-module-core]] — the worked example this feature mirrors (registry/sync, admin read, two-test split).
- [[data-erasure|.context/privacy/data-erasure.md]] — the fork-table FK + erasure pattern for `SlotValue`.
- [[planning-retro]] — process lessons applied here (B1 sizing, B4 gates-in-done-when, B8 boot-reconcile
  correctness, B9 vitest strategy); fold new lessons back on close-out.

---
name: f-journey-state
feature: 09 · f-journey-state
epic: Framework v1
status: in flight (t-1 available · t-2 backlog)
owner: John
depends_on: f-map (shipped — #16 / #20 / #21, for the published-map the state is interpreted against) · f-bootstrap (shipped, for the `lib/framework/facilitation/` skeleton + boundary)
spec: framework-architecture.md §5.2 (journey state) · §5.4 (guidance context) · §4.3 (engagement stream = journey log) · §7 (scope) · §8 (relationship overlay) · §11 (erasure) + Appendix A (F2 / F10 / F19 / X1 / X2 / X3)
parent: plan.md
opened: 2026-07-04
---

# f-journey-state — journey state + access discipline

> Feature-level build plan for **`f-journey-state`**, the per-user runtime-state layer over the
> authored map + the framework's single read-access seam.
> Parent: [[plan#09 · `f-journey-state` — journey state + access discipline|plan.md]].
> Binding _how_: [[framework-architecture#5.2 Journey State — runtime traversal|§5.2]] (the three
> models), [[framework-architecture#8. The relationship & cohort overlay — a designed seam, not a built feature|§8]],
> and the decisions in Appendix A — **F2** (state interpreted against the live published version),
> **F10** (event log is source of truth, `UserNodeState` a materialised projection), **F19** (multiple
> graphs per deployment), **X1** (free-form `String`, no Prisma enums), **X2** (`canRead` + subject-scope
> from day one), **X3** (non-nullable `contextKey @default("")`). Sizing follows the parent plan:
> **task = one PR** (~200–600 lines); commits sit below this resolution.

## Intent

Stand up **per-user runtime traversal state** over the authored facilitation map (spec §5.2), plus
the **read-access discipline** every journey/slot read routes through from day one (X2). Three
models: `UserJourney` (one per user per graph per context), `UserNodeState` (the current-standing
projection, kept materialised for cheap reads), and the insert-only `JourneyEvent` log (the full
history — the source of truth `UserNodeState` projects, F10). This is the state the deterministic
**engine** (`f-engine`, 11) writes and **guidance** (`f-guidance`, 12) reads; alongside `f-map` it
sits at the head of the critical path.

The access seam — `canRead(viewer, subject, scope)` + a `subjectScope` filter — is the one function
every journey and slot read goes through, so that §8's relational/cohort features are later _a policy
change inside one function_ instead of a codebase-wide sweep of `where userId` (X2). It is built to
**compose with** the Sunrise scope-predicate seam (#366 tier / #367 ownership), not as a
framework-private parallel check.

## What ships here, and what deliberately does not

**In scope.** The three journey-state models + the node-state status vocabulary; GDPR erasure
(hand-FK cascade, smoke-proven); `canRead` + `subjectScope` (async, #367-composing) in
`lib/framework/shared/`; and journey **read** queries routed through `canRead`.

**Out of scope** (owned by the features that consume them, so no dead surface lands early):

- **All journey-state WRITES** — journey creation, node-state transitions, event appends — are
  **`f-engine` (11)**, the sole writer of state (F11 / §5.3). This feature ships the state _shape_ +
  _read/access_, not the writer. The three tables ship **without a writer** (see reconciliation 3).
- **Engagement writes + module stats** — dispatching module-lifecycle events into `JourneyEvent` and
  aggregating the stats read side are **`f-engagement` (08)**; this feature only _creates_ the shared
  table (reconciliation 1).
- **The journey explorer / analytics UI** → `f-ops-views` (15). **Cohorts / `JourneyLink` / consent**
  → the parked §8 relationship overlay. **Guidance ranking** → `f-guidance` (12). **Slot-read
  rewiring** — `getSlotHeads` stays the raw engine `f-slots` shipped; this feature provides `canRead`
  and documents the guarding path its consumers (`f-slot-capture`, `f-guidance`) apply, rather than
  wrapping the shipped engine.

## Reconciliation with current repo reality — the design decisions

Organising principle, carried from [[f-module-core]] / [[f-slots]]: **ship nothing a fork has to
delete.** A `git fork` of Daybreak boots to **empty** journey tables (no journeys until a user walks
a map, and the writer is `f-engine`), while every layer here is proven by tests + an erasure smoke.
The spec (rev 16) predates the code, so each assumption is verified against the tree. Decisions
(2026-07-04):

1. **`JourneyEvent` is created here** (the §5.2 journey-spine model), even though the board also
   listed it under `f-engagement` (08) t-1. The spec is explicit that the engagement stream and the
   journey log are **one shared table** ("§4.3 = §5.4, they are the same stream"). f-journey-state
   creates it; **f-engagement extends its _use_** (module-lifecycle event types + stats aggregation),
   not its schema — `type` is a free-form `String` (X1), so new event kinds are not migrations. Adds a
   coordination note to feature 08 on the board + a decisions-log entry. **No hard dependency edge**
   (a small additive create; whichever of 08/09 ships first would own it, and 09 is in flight now).

2. **`JourneyEvent` is `userId`-keyed with a hand-FK cascade + an _optional_ `journeyId`** — resolving
   the spec's split sketch. §4.3 keys it on `userId` (engagement events — `session.started`, module
   lifecycle — many with no journey); §5.2 keys it on `journeyId`. These are one stream but disagree on
   the key column, and only the `userId` shape holds **both** cases while keeping every row erasable:

   - journey-traversal events set `journeyId` (+ `nodeKey`);
   - non-journey engagement events leave `journeyId` null;
   - **every** row is reachable from the user via the `userId` hand-FK, so erasure is total.

   A `journeyId`-only table can't record §4.3's non-journey events; making `journeyId` nullable to
   admit them (with no `userId`) leaves those rows with **no FK path to the user** — they survive
   `eraseUser()`, a GDPR hole. The `userId` shape matches §4.3 verbatim and §11's erasure list (which
   names `UserJourney`/`JourneyEvent` — _not_ `UserNodeState` — as the hand-FK-cascade tables), at the
   cost of one extra hand-FK line (the exact `SlotValue` pattern). See the erasure topology in
   decision 4.

3. **Writes deferred to `f-engine`.** The three tables ship here **without a writer** — foundational,
   not inert: erasure is real and smoke-tested, and these are precisely the tables `f-engine` will
   write (`applyEvent` → single-transaction event append + projection update, F11) and `f-guidance`
   will read. Same pattern as `f-map` shipping models + version-service while deferring graph-invariant
   checks to `f-engine`, and `f-slots` shipping the `getSlotHeads` engine before `f-slot-capture`. The
   **read** queries this feature ships (per-journey / per-node-state reads, `canRead`-guarded) are what
   the engine and guidance layers consume — not a table nothing touches.

4. **Erasure topology.** Two hand-written scalar FKs, `ON DELETE CASCADE`, **referencing the lowercase
   `@@map("user")` table name `"user"`, not the model name `User`** (the B11 lesson — `"User"` fails at
   apply). Applied with `db:migrate:deploy` (not `migrate dev`, which sees the hand-FK as drift and
   offers to reset):

   - `UserJourney.userId → "user"`
   - `JourneyEvent.userId → "user"`

   And Prisma-internal `@relation onDelete: Cascade` (Prisma-emitted, no hand-SQL, no core edit) for
   the framework-internal edges:

   - `UserNodeState.journeyId → UserJourney` (the `nodeStates UserNodeState[]` back-relation in §5.2)
   - `JourneyEvent.journeyId → UserJourney` — **optional** (`String?`), `onDelete: SetNull` (a
     journey-scoped event's link nulls if its journey is removed; user-erasure already reaches the row
     via the `userId` hand-FK, so nothing leaks). Two cascade paths converging on `JourneyEvent` is
     fine in Postgres.

   So `eraseUser()`'s `tx.user.delete()` removes `UserJourney` + `JourneyEvent` directly via their
   `userId` hand-FKs, and `UserNodeState` transitively via its journey. **Proven** by extending
   `scripts/smoke/erasure.ts`: seed a `UserJourney` + a `UserNodeState` + **two** `JourneyEvent` rows
   (one journey-linked, one null-`journeyId` engagement event), erase, assert all four gone.

5. **`UserJourney.graphSlug` is a plain `String`, no FK to `FacilitationGraph`** — mirrors
   `SlotValue.slotSlug` (and `FacilitationGraphVersion` carrying `createdBy` as a bare `String`). Per
   **F2**, state is interpreted against the _live published version_ of the map, so republishing or a
   graph edit must **not** orphan journey rows via a broken FK. The `f-map` dependency is conceptual
   (the map must exist to walk), not a schema-level foreign key.

6. **`contextKey String @default("")` (non-nullable, X3)** — verbatim spec. The empty-string sentinel
   is load-bearing: Postgres treats NULLs as distinct in unique indexes, so a nullable `contextKey`
   would let duplicate `(userId, graphSlug)` default journeys slip past `@@unique([userId, graphSlug,
contextKey])`. `""` = the default, context-free journey.

7. **`canRead` / `subjectScope` are `async` from day one** and **compose with #366/#367.** The spec's
   "one line today" body — `viewer.userId === subject || admin-support-tooling`, default-deny — is
   synchronous, **but** §8's `JourneyLink` grants require a DB lookup, so making the predicate async
   _now_ avoids a later sync→async sweep of every caller (the exact codebase-wide churn X2 exists to
   prevent). The `scope` argument is an **open structured value** carrying #367's ownership input
   (`own | team | all`) and #366's tier input, so wiring the upstream resolver later is _supplying an
   input_ to an existing predicate, not a rewrite. #366/#367 are **verified not landed** (no ownership
   resolver in `lib/auth/`), so this build **mirrors** the one-predicate-three-inputs contract; if #367
   has landed by the time t-2 is built, delegate to it instead (check first).

8. **`canRead` lives in `lib/framework/shared/`** (next to `scope.ts`), not in the facilitation
   domain — it guards **both** journey reads _and_ slot reads, so it is cross-domain framework
   infrastructure, not facilitation-private. `f-slots` already left the seam: `getSlotHeads`'s doc
   comment records that "access scoping (`canRead`) wraps this later (`f-journey-state`); the `userId`
   argument is the seam that predicate supplies."

9. **Upstream: no _new_ Sunrise issue** (pure framework-tier — everything lives in `lib/framework/**`
   - `prisma/schema/framework-facilitation.prisma`, consuming only shipped seams and the whitelisted
     framework→core `userId` FK). But per the fork-first-informs-upstream working model, **add a
     fork-perspective note to the existing Sunrise #367** with the concrete `canRead(viewer, subject,
scope)` contract this build produces, so the upstream resolver is shaped to compose down cleanly.
     Listed as a t-2 Done-when deliverable.

## Reuse anchors found in-tree

- **The satellite / hand-FK pattern** — `prisma/schema/framework-data-slots.prisma` `SlotValue.userId`
  (plain scalar, no `@relation`; `ON DELETE CASCADE` hand-written in the migration SQL against `"user"`).
  Copy verbatim for `UserJourney.userId` and `JourneyEvent.userId`. The comment block there (lines
  49–58) is the template for the schema comments here.
- **Prisma-internal `@relation` cascade** — `prisma/schema/framework-facilitation.prisma`
  `FacilitationGraphVersion.graphId → FacilitationGraph … onDelete: Cascade` (line 54) is the exact
  shape for `UserNodeState.journeyId → UserJourney` and the optional `JourneyEvent.journeyId`.
- **The empty schema file is already there** — `framework-facilitation.prisma` already holds
  `FacilitationGraph` + `FacilitationGraphVersion` (from `f-map`) and its header explicitly says
  "Journey state / events / policies arrive in `f-journey-state`." Fill it; no new schema file.
- **Insert-only versioned precedent** — `AiWorkflowExecution` ↔ its step events (the projection-over-log
  relationship F10 names), and `SlotValue`'s insert-only discipline. `JourneyEvent` never mutates;
  `UserNodeState` is the materialised head.
- **Erasure smoke** — `scripts/smoke/erasure.ts` already seeds a `SlotValue` (lines 87–100) and asserts
  cascade after `eraseUser()` (lines 155–158). Add the three journey tables the same way, in the same
  create → erase → assert-gone → self-clean structure (track ids in the `finally`).
- **Read-query module** — `lib/framework/facilitation/map/queries.ts` (`listGraphs` / `getGraphDetail`,
  `prisma` import, `NotFoundError`, "does not swallow errors") is the pattern for
  `facilitation/journey/queries.ts`.
- **Scope vocabulary + shared barrel** — `lib/framework/shared/scope.ts` (the one scoping vocabulary,
  dependency-free, boundary-clean) + `shared/index.ts` (`export * from …/scope`). `canRead` lands as
  `shared/access.ts` and is re-exported from the barrel next to it.
- **Node/nodeKey vocabulary** — `lib/framework/shared/scope.ts` already owns `NodeKey`; the map format
  (`lib/framework/facilitation/map/schema.ts`) owns node types and `completionMode` — the node-state
  `status` vocabulary here (`unvisited | available | active | visited | completed`) is a **new** small
  `as const` in `facilitation/journey/vocabulary.ts`, mirroring `data-slots/vocabulary.ts` /
  `modules/status.ts`.

## Test strategy (vitest — no live DB) — stated up front (B9)

Vitest runs on `happy-dom` with **no live DB**. Every DB test here:

- **mocks `@/lib/db/client`**; where a query runs inside a transaction, **forwards `executeTransaction`
  to a `tx` mock** (`async (cb) => cb(prismaFake)`). (This feature ships no writer, so the transaction
  surface is light — reads dominate.)
- **`canRead` / `subjectScope`** are the core of t-2 and are **pure-ish** (async, but the single-user
  path takes no DB): unit-test `viewer === subject` → allow; admin support-tooling path → allow;
  default-deny (unrelated viewer) → deny; and the **async / #367-input contract** — that `scope`
  carries `own | team | all` + tier without the function branching on unmodelled inputs today.
- **Journey read queries** → mocked-`@/lib/db/client` unit tests asserting the **query shape** (the
  `where`/`@@unique` selectors, `@@index([journeyId, occurredAt])`-served ordering) **and that each
  read routes through `canRead`** (spy that a denied `canRead` short-circuits the query / throws before
  hitting Prisma); plus a small **stateful in-memory fake** e2e proving the access-through-reads chain
  (copy the shape of `tests/integration/lib/framework/data-slots/registration-visibility.test.ts` —
  `vi.hoisted` fake, `matches(row, where)`, dynamic `await import` after mocks, `__reset…ForTests()`).
- **Erasure** → **real-DB smoke** (`scripts/smoke/erasure.ts`), **not** vitest — asserts the journey,
  the node-state, and **both** events (journey-linked + null-`journeyId`) are gone after `eraseUser()`.

Never "integration test against the dev DB" in vitest.

## Tasks (promoted)

| ID  | Task                                                                                                                                                     | Files                                                                                                                                                                     | Deps | Status    | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | --- |
| t-1 | **Journey-state models + erasure.** The three models (userId hand-FK + optional `journeyId`) + node-state status vocabulary + migration + erasure smoke. | `prisma/schema/framework-facilitation.prisma`, `lib/framework/facilitation/journey/{vocabulary,index}.ts`, `framework_…` migration, `scripts/smoke/erasure.ts`, `tests/…` | —    | available | —   |
| t-2 | **Access discipline.** `canRead` + `subjectScope` (async, #367-composing) + journey read queries routed through them + the #367 fork-note.               | `lib/framework/shared/{access,index}.ts`, `lib/framework/facilitation/journey/{queries,index}.ts`, `tests/…`                                                              | t-1  | backlog   | —   |

**Sizing (B1 self-check): 3 indicative → 2 promoted.** The board's indicative t-2 (`canRead`) and t-3
(subject-scope) **fold into one access PR** — `canRead` (the row predicate) and `subjectScope` (its
where-clause face) are the _same seam_ at two shapes, and a subject-scope filter with no analytics
consumer yet is the commit-sized sliver [[planning-retro#B1 · Sizing self-check when promoting tasks|B1]]
says to fold. Net 3 → 2, mirroring [[f-module-core]] (4→3) and [[f-slots]] (3, folded). **One
deliberate "ship ahead of consumer" call:** `subjectScope` lands before its first consumer
(`f-ops-views`, 15) because X2 mandates the discipline "from day one" — shipping the seam now is what
stops `f-ops-views` scattering raw `where userId` later. Owner to confirm on review; if reversed,
`subjectScope` moves to `f-ops-views` and t-2 ships `canRead` + journey reads only.

### t-1 · Journey-state models + erasure — the state shape

The three tables + the erasure proof. No writer (that is `f-engine`); this establishes the shape and
the GDPR guarantee. Also carries this plan doc.

**Schema (`prisma/schema/framework-facilitation.prisma`, append to the existing file):**

- **`model UserJourney`** per §5.2: `id`, `userId String` (**plain FK, no `@relation`** — satellite +
  hand-FK), `graphSlug String` (**plain string, no FK** — F2, decision 5), `contextKey String
@default("")` (**non-nullable**, X3 — keep the load-bearing-sentinel comment), `startedAt DateTime
@default(now())`, `nodeStates UserNodeState[]` back-relation; `@@unique([userId, graphSlug,
contextKey])`; `@@map("framework_user_journey")`.
- **`model UserNodeState`** per §5.2: `id`, `journeyId String`, `nodeKey String`, `status String`
  (free-form, X1 — `unvisited | available | active | visited | completed` in the comment +
  `vocabulary.ts`), `timesCompleted Int @default(0)`, `progress Json?` (module-owned, engine-opaque —
  keep the F7 comment), `firstEnteredAt DateTime?`, `lastActiveAt DateTime?`, `completedAt DateTime?`;
  `journey UserJourney @relation(fields: [journeyId], references: [id], onDelete: Cascade)`;
  `@@unique([journeyId, nodeKey])`; `@@map("framework_user_node_state")`.
- **`model JourneyEvent`** (`// INSERT-ONLY — never updated, never deleted (except erasure)`), the
  resolved shape (decisions 2 + 4): `id`, `userId String` (**plain FK, no `@relation`** — hand-FK
  cascade, the row's erasure path), `journeyId String?` (**optional** `@relation(fields: [journeyId],
references: [id], onDelete: SetNull)` — set for journey-traversal events, null for engagement),
  `nodeKey String?`, `moduleSlug String?`, `type String` (free-form, X1), `payload Json?`, `occurredAt
DateTime @default(now())`; `@@index([userId, occurredAt])` (erasure + per-user engagement reads) and
  `@@index([journeyId, occurredAt])` (§5.2 — the journey timeline); `@@map("framework_journey_event")`.
  Add a comment block (mirroring `SlotValue`) explaining the two write-sources, the `userId` hand-FK,
  and why `journeyId` is optional.
- **Back-relations on `UserJourney`** — add `events JourneyEvent[]` alongside `nodeStates
UserNodeState[]` (Prisma requires the reverse side of the optional `journeyId` relation).

**Vocabulary (`lib/framework/facilitation/journey/vocabulary.ts`):** `NODE_STATE_STATUS` `as const`
(`unvisited | available | active | visited | completed`) + derived union `NodeStateStatus`, mirroring
`data-slots/vocabulary.ts`. Free-string, so a new status is not a migration. `index.ts` barrels it.

**Migration** `…_framework_add_journey_state` — `prisma migrate dev --create-only`; the tables +
Prisma-emitted `UserNodeState`/`JourneyEvent` `journeyId` FKs come from the schema, then **hand-add the
two scalar cascades Prisma won't emit**:

```sql
ALTER TABLE "framework_user_journey"  ADD CONSTRAINT "framework_user_journey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
ALTER TABLE "framework_journey_event" ADD CONSTRAINT "framework_journey_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
```

Reference `"user"` (the `@@map`), **not** `"User"` (B11). Strip Prisma's spurious pgvector/tsvector
`DROP`s ([[prisma-unmodelled-objects|.context/database/prisma-unmodelled-objects.md]]). Apply with
`db:migrate:deploy` (not `migrate dev` — it sees the two hand-FKs as drift). The migration-drift check
flags the two hand-FK lines — **expected** (the fork-table pattern).

**Erasure proof (`scripts/smoke/erasure.ts`):** add — seed a `UserJourney` (for the subject), a
`UserNodeState` under it, and **two** `JourneyEvent` rows (one with `journeyId` set, one with
`journeyId` null + a `moduleSlug`, the engagement case); after `eraseUser()`, assert all four are
`null`; track the ids and `deleteMany`-clean them in the `finally`. Add a short assertion label per
row (e.g. "framework journey cascade-deleted (hand-written ON DELETE CASCADE)", "null-journeyId
engagement event cascade-deleted via userId FK").

**Proof tests (mocked-prisma, `tests/…`):** a unit test asserting the model **query shapes** the
read/erasure paths rely on (the `@@unique` selectors; the two `JourneyEvent` indexes' ordering) — since
there is no writer, this is thin; the real cascade proof is the smoke. (The stateful-fake e2e is t-2,
where the read queries exist.)

**Done when:** migration applies clean via `db:migrate:deploy` with **both** hand-FK cascades + the
Prisma `journeyId` relations; the two hand-FK lines are the only drift-check flags; a fresh fork boots
to **empty** journey tables; the erasure smoke asserts journey + node-state + **both** events gone
after `eraseUser()`; **gates green — `/pre-pr` then `/code-review`, both before opening the PR** (B4).

### t-2 · Access discipline — `canRead`, subject-scope, journey reads

The one function every journey/slot read routes through, plus the analytics-face filter and the
journey read queries that consume them.

- **`lib/framework/shared/access.ts`** — the seam:
  - **`canRead(viewer, subject, scope): Promise<boolean>`** — **async** (decision 7). Body today:
    default-deny; allow when `viewer.userId === subject`; allow the **admin support-tooling** path
    (an explicit `viewer.isAdminSupport`-style flag, not a bare role check — keep it narrow and
    logged-friendly). `scope` is an **open structured type** — `{ ownership?: 'own' | 'team' | 'all';
tier?: string; … }` — carried through but not branched on for unmodelled inputs today (single-user
    Lelanea exercises only `own`). Document that when Sunrise #367 lands, `canRead` **delegates to**
    its resolver (supplying `scope` as the input); until then it mirrors the one-predicate-three-inputs
    contract. `viewer` / `subject` typed off the session-user shape (no core `lib/auth` edit — accept
    the minimal viewer fields as a framework-local interface, bridged by shape like `scope.ts` bridges
    to the core scope map).
  - **`subjectScope(viewer, scope): Promise<{ userId: … }>`** (or a Prisma-`where` fragment) — the
    list/analytics face of the same predicate: "which subjects may this viewer see?" Today → `{ userId:
viewer.userId }` (one user); shaped so `own | team | all` widens it later without a rewrite. This is
    the filter `f-ops-views`' journey analytics will `AND` into its aggregations.
- **`lib/framework/shared/index.ts`** — re-export `access` next to `scope` (`export * from
'@/lib/framework/shared/access'`).
- **`lib/framework/facilitation/journey/queries.ts`** — the `canRead`-guarded reads `f-engine` /
  `f-guidance` consume: e.g. `getJourney(viewer, { userId, graphSlug, contextKey })` and
  `getNodeStates(viewer, journeyId)` / `getJourneyTimeline(viewer, journeyId, …)` — each **calls
  `canRead` first** and throws / returns empty on deny before touching Prisma. Mirror
  `map/queries.ts` (raw `prisma`, `NotFoundError`, does not swallow errors). `index.ts` barrels them.
- **Slot-read guarding path — documented, not rewired.** `getSlotHeads` stays the raw engine `f-slots`
  shipped (taking `userId`); this feature **documents** — in `access.ts` and a note the `f-slot-capture`
  / `f-guidance` plans reference — that those consumers call `canRead(viewer, subject, scope)` (or
  `subjectScope`) _before_ `getSlotHeads`, supplying the seam `getSlotHeads` left open. No edit to the
  shipped engine.
- **Upstream #367 fork-note (decision 9)** — as a deliverable, add the concrete `canRead(viewer,
subject, scope)` contract this build produced (signature, the `own|team|all` + tier scope shape, the
  async rationale) as a fork-perspective note on Sunrise **#367**, so the upstream resolver composes
  down. No new issue.
- **Tests (`tests/…`):** `canRead` units (viewer==subject allow; admin-support allow; default-deny;
  the async/#367-input contract); `subjectScope` units (single-user `{ userId }` today; shape admits
  `own|team|all`); journey-query units asserting each read **routes through `canRead`** (denied → no
  Prisma call) + the query shape; and the **stateful in-memory fake e2e** proving the
  access-through-reads chain (seed journeys for two users, assert viewer A reads only A's rows via the
  guarded queries).

**Done when:** every journey read routes through `canRead`; `canRead` / `subjectScope` are async and
carry the open `scope` (single-user allow/deny correct, structure ready for #367); the slot-read
guarding path is documented (shipped `getSlotHeads` untouched); the #367 fork-note is filed; the
mocked-prisma units + stateful-fake e2e are green; **gates green — `/pre-pr` then `/code-review`, both
before opening the PR** (B4).

## Boundary & forkability notes

- **Everything is framework-tier.** All new `lib/framework/facilitation/journey/**` +
  `lib/framework/shared/access.ts` code imports core only through public seams; the boundary CI covers
  it both directions. The only cross-tier references are the two `framework_*.userId → "user"` FKs,
  explicitly whitelisted (`scripts/boundary/lib.ts`: a framework→core FK is allowed — hygiene is about
  DDL ownership, not the FK graph). No edit to the core `User` model, no edit to `lib/app/*` (the
  `initApp` shape is frozen — this feature adds no boot sync).
- **Leaf surface stays reserved-empty.** No `lib/app/*` scaffold; a leaf gets journey state for free by
  authoring a map + (via `f-engine`) walking it. Daybreak itself ships zero journeys → empty tables,
  nothing to strip.
- **Migration hygiene.** One `framework_`-named migration touching only `framework_*` tables (the two
  `userId` FKs _reference_ core `"user"` but do not `CREATE`/`ALTER` it — allowed).
- **No new upstream issue** (pure framework-tier); the #367 fork-note is added to the _existing_ issue.

## Open questions

- **`subjectScope` placement (sizing decision).** Proceeding with "ships in t-2, ahead of its
  `f-ops-views` consumer" (recommended — X2 "from day one"). Owner to confirm; if reversed, it moves to
  `f-ops-views` and t-2 is `canRead` + journey reads only.
- **`canRead` viewer type.** Proceeding with a **framework-local viewer interface** (minimal session
  fields, bridged by shape) rather than importing a core auth type — keeps the boundary clean, same as
  `scope.ts` bridging to the core scope map. Revisit only if #367 lands first and dictates a shape.
- **`JourneyEvent.journeyId` on-delete: `SetNull` vs `Cascade`.** Proceeding with **`SetNull`** (a
  removed journey nulls its events' link; user-erasure still reaches them via `userId`). `Cascade`
  would also be correct; `SetNull` preserves the engagement stream's history if a journey is ever
  hard-deleted outside erasure. Cheap to change if the engine's delete semantics (f-engine) prefer
  cascade.
- **#367 resolved shape.** If #367 has landed upstream by the time t-2 is built, **delegate** to its
  resolver instead of mirroring the contract (check first). Not landed as of 2026-07-04.

## Done when (feature)

The three journey-state models exist with the resolved erasure topology (`UserJourney.userId` +
`JourneyEvent.userId` hand-FK cascades; `UserNodeState` + optional `JourneyEvent.journeyId` via Prisma
`@relation`), smoke-proven to erase journey + node-state + both event kinds after `eraseUser()`;
`canRead(viewer, subject, scope)` + `subjectScope` provide the single async access seam every journey
read routes through, shaped to compose with Sunrise #366/#367; the slot-read guarding path is
documented (shipped `getSlotHeads` untouched); and the whole path is proven by mocked-prisma units + a
stateful-fake e2e + the erasure smoke — **with a fresh fork booting to empty journey tables, nothing to
strip.** No new upstream Sunrise issue (the #367 fork-note is added to the existing one). On the last
merge: flip `f-journey-state` → **shipped**, flip **`f-engine` (11)** and **`f-ops-views` (15)** from
`blocked` toward `available` as their other deps allow, add a Work-completed log line, and append
execution lessons to [[planning-retro]] §B.

## References

- [[plan#09 · `f-journey-state` — journey state + access discipline|plan.md feature 09]] — parent.
- [[framework-architecture#5.2 Journey State — runtime traversal|spec §5.2]] (the three models) +
  [[framework-architecture#4.3 Stats and engagement|§4.3]] (the shared stream) +
  [[framework-architecture#8. The relationship & cohort overlay — a designed seam, not a built feature|§8]]
  (the seam `canRead`/`contextKey`/subject-scope enable) + §11 (erasure) + Appendix A (F2 / F10 / F19 /
  X1 / X2 / X3).
- [[f-slots]] — the worked example this feature mirrors (satellite hand-FK + erasure smoke, `canRead`
  seam left on `getSlotHeads`, vitest-no-live-DB strategy, B1 sizing fold).
- [[f-map]] — the map the state is interpreted against (F2); `map/queries.ts` is the read-query pattern.
- [[data-erasure|.context/privacy/data-erasure.md]] — the fork-table FK + erasure pattern.
- [[planning-retro]] — process lessons applied here (B1 sizing, B4 gates-in-done-when, B9 vitest
  strategy, B11 the `"user"`-not-`"User"` FK lesson); fold new lessons back on close-out.

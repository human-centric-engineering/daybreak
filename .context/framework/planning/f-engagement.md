---
name: f-engagement
feature: 08 · f-engagement
epic: Framework v1
status: in flight (dep f-module-core shipped ✅) — planned, tasks promoted
owner: John
depends_on: f-module-core (shipped — the module registry/service this instruments) · reuses the shared `JourneyEvent` stream (created by f-journey-state, shipped) + `runModuleWorkflowBindings` (the receiver f-module-bindings shipped, unwired) + the framework capability seam (f-slot-capture) + the module surface chat route (f-guidance t-5)
spec: framework-architecture.md §4.3 (stats & engagement) · Appendix A — A9 (stats from an insert-only event stream, never counters) · X1 (free-form `String` event `type`)
parent: plan.md
opened: 2026-07-07
planned: 2026-07-07
---

# f-engagement — module event stream + stats + feedback

> Feature-level build plan for **`f-engagement`** (08). Parent: [[plan#08 · `f-engagement`|plan.md]].
> Binding _how_: [[framework-architecture#4.3 Stats and engagement|§4.3]] + A9 (derive stats from the
> insert-only stream, never counters) and X1 (event `type` is a free-form `String`, so new event kinds
> are not migrations). **Build-ready** — reconciled against repo reality (a reconnaissance sweep of the
> `JourneyEvent` stream + erasure, the `runModuleWorkflowBindings` receiver + the hook system, and the
> capability seam + feedback precedent + the f-ops-views UI seams, 2026-07-07). Sizing: **task = one PR**
> (~200–600 lines), **3 PRs**.

## Intent

Turn the module spine into something you can _observe_ and _react to_ (spec §4.3): a module emits
**engagement events** into the shared insert-only stream, an operator sees **module stats** derived from
that stream (never counters — A9), and bound agents / UI can **capture feedback**. Three deliverables:

1. **An engagement emit seam** — one function that records a module event into the `JourneyEvent` stream
   **and** fires the module→workflow bindings, wired at the module surface chat entry. This is also what
   makes [[f-module-bindings]]'s shipped-but-unwired `runModuleWorkflowBindings` actually fire.
2. **`record_feedback`** — a built-in framework capability any bound agent can call, plus a plain
   user-facing feedback API endpoint; both land a `module.feedback` event on the same stream.
3. **Module stats** — an admin read side (unique users, entries, completion, dwell, return, ratings)
   aggregated from the stream, surfaced as a Stats tab on the shipped module detail page.

The stream, the workflow-binding receiver, the capability seam, the surface route, and the admin UI host
are **all already shipped**; this feature is the thin adapter that emits into them and reads back out.
**Reuse over reinvention** — it adds no new table, extends `JourneyEvent`'s _use_ not its _schema_
(the schema comment literally names f-engagement as the vocabulary + read-side owner).

## Reconciliation with repo reality — the design decisions (settled 2026-07-07)

Organising principle: **extend the stream's use, never its schema**; **reuse the shipped seams**; **ship
nothing a fork has to delete**; **confirm "pure framework-tier" at build** ([[planning-retro#B17|B17]]).

1. **The event stream already exists, already carries `moduleSlug`, and is erasure-safe — f-engagement
   only adds new `type` values + the read side.** `JourneyEvent`
   ([`framework-facilitation.prisma`](../../prisma/schema/framework-facilitation.prisma)) is `userId`
   (NOT NULL, hand-FK `ON DELETE CASCADE`), `journeyId?`, `nodeKey?`, **`moduleSlug?`**, `type` (free-form
   `String`, X1), `payload Json?`, `occurredAt`; indexed `(userId, occurredAt)` and `(journeyId,
occurredAt)`. Today only two `type`s are written — `node_entered` / `node_completed` — and crucially
   **`applyEvent` already stamps `moduleSlug: node.moduleSlug ?? null`**
   ([`engine/apply-event.ts:181`](../../lib/framework/facilitation/engine/apply-event.ts)), so
   **module progression/completion for journey-driven module nodes is _already_ in the stream**. New
   event kinds (`module.entered`, `module.feedback`) are **not migrations** (X1). Erasure is a pure
   cascade (the smoke already asserts a null-`journeyId` engagement event is gone after `eraseUser` —
   [`scripts/smoke/erasure.ts`](../../scripts/smoke/erasure.ts)); no hook needed.

2. **The per-user stream carries only genuine _user_ engagement (userId-scoped, erasable); operator
   lifecycle is not an "engagement" event.** `JourneyEvent.userId` is NOT NULL, so an operator status
   change (draft→active→retired — no subject user) does **not** fit the erasable per-user stream and is
   **not** written to it. v1 emits exactly the user-scoped events that have a real `(userId, moduleSlug)`
   at runtime:
   - **`module.entered`** — emitted from the **module surface chat route**
     ([`app/api/v1/framework/modules/[slug]/chat/stream/route.ts`](../../app/api/v1/framework/modules/[slug]/chat/stream/route.ts))
     on a **fresh** surface conversation (`surface.conversationId === undefined` ⇒ first entry, not a
     resume). `journeyId` null (non-journey engagement), `moduleSlug` set.
   - **`module.feedback`** — emitted by `record_feedback` (t-2), payload `{ rating, comment? }`.
   - _Already in the stream_ (no new emit): **`node_entered` / `node_completed`** with `moduleSlug`,
     from the pure engine — the module-progression/completion signal stats reads.

3. **The emit seam has two limbs, both best-effort, and it is what finally fires the shipped
   workflow-binding receiver.** `recordModuleEngagement(userId, moduleSlug, type, payload?, journeyId?)`
   (new, `lib/framework/engagement/`) (a) inserts one `JourneyEvent` row and (b) **fire-and-forget** calls
   `runModuleWorkflowBindings(moduleSlug, type, { userId, ...payload })`
   ([`modules/workflow-bindings/dispatch.ts`](../../lib/framework/modules/workflow-bindings/dispatch.ts) —
   complete, tested, and confirmed to have **no production caller yet**; it dispatches via `drainEngine`,
   the same row→workflow trigger every other path uses). Each limb is isolated so a binding-dispatch
   failure never breaks the chat stream and a write failure never blocks the other limb. This closes the
   coordination note the board flagged: an operator's "when a user enters this module, run workflow Y"
   now actually fires. **Not via `emitHookEvent`** — verified outbound-webhook-only, and its
   `HOOK_EVENT_TYPES` enum has no `module.*` members (using it would force a Sunrise-core edit; the
   `runModuleWorkflowBindings` path is the fork-lawful one, exactly as its 07-shipped header says).

4. **`record_feedback` reuses the capability seam verbatim; there is no core feedback table to reuse (and
   none to build).** The only core feedback mechanism is `AiMessage.rating` (a per-message thumbs scalar
   — wrong grain for module feedback), so feedback lives on the event stream as `module.feedback`, exactly
   as §4.3 designs. The cap is a `BaseCapability` subclass mirroring
   [`data-slots/capabilities/fill-slot.ts`](../../lib/framework/data-slots/capabilities/fill-slot.ts):
   `slug='record_feedback'`, `processesPii=true` + a `redactProvenance` that masks the free-text comment,
   resolving `moduleSlug` from `context.scope.moduleSlug` (the X5 surface scope) with an explicit arg
   fallback. Registered in `initFramework()` via a new `engagementCapabilities` array (DB row + operator
   flags sync automatically through [`capabilities/sync.ts`](../../lib/framework/capabilities/sync.ts),
   marker `framework-builtin`). The plain UI endpoint is `POST
/api/v1/framework/modules/[slug]/feedback` (`withAuth` — the end-user submits it; automatic
   `proxy.ts` rate-limit + a mutation sub-cap), writing the same event through the seam.

5. **Stats mirror the shipped `groupBy`+`_count` aggregation precedent, subject-scope-shaped from the
   start.** The query fn (`lib/framework/engagement/stats.ts`) aggregates `JourneyEvent` filtered by
   `moduleSlug`, mirroring [`journey/admin-queries.ts`](../../lib/framework/facilitation/journey/admin-queries.ts)
   (Prisma `groupBy` + in-memory fold; a raw `COUNT(DISTINCT userId)` where `groupBy` can't express it):
   **unique users**, **entries** (`module.entered` count), **completion** (from `node_completed` w/
   `moduleSlug`), **dwell/return** (from `occurredAt` deltas + repeat entries), **ratings distribution +
   recent comments** (from `module.feedback`). This is the **first cross-user/aggregate query over
   `JourneyEvent`** (all existing reads are single-subject, `canRead`-guarded); it is `withAdminAuth`
   cross-user by nature, but the query is **shaped to accept a subject-scope filter** (the #367 axis at
   the analytics layer — exactly [[f-journey-state]]'s indicative t-3), so owner/team/cohort-scoped stats
   are a later filter, not a rewrite. Surfaced as a **Stats tab** appended to the module detail page's
   `tabs` array (the real in-file host seam —
   [`module-detail.tsx:94`](../../components/admin/framework/module-detail/module-detail.tsx), threaded
   through the page loader), via `GET /api/v1/admin/framework/modules/[slug]/stats`.

6. **Likely pure framework-tier, but t-3 may add a framework index — confirm at build (B17).** Nothing
   here edits Sunrise core (the surface route, the module-detail component, the capability seam, the event
   stream, and `runModuleWorkflowBindings` are all framework-tier). So this is expected to be the **fourth
   pure-framework-tier feature with no upstream issue** — _except_ the t-3 stats query filters on
   `moduleSlug` (+ `type`), which the two existing `(userId|journeyId, occurredAt)` indexes don't cover;
   at scale that wants a **framework-scoped index** on `framework_journey_event (moduleSlug, occurredAt)`
   — a `framework_*` migration (B13: strip the spurious pgvector/tsvector `DROP INDEX`), not a core edit.
   Confirm the index is warranted at build rather than shipping a speculative one.

## Tasks (promoted)

| ID   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                | Files (indicative)                                                                                                                                                                                                                            | Deps | Status    | PR   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | ---- |
| t-1  | **Engagement emit seam + `module.entered` wiring + workflow-binding fire (anchor).** `recordModuleEngagement(userId, moduleSlug, type, payload?, journeyId?)` — insert one `JourneyEvent` + fire-and-forget `runModuleWorkflowBindings`, each limb isolated; the engagement `type` vocabulary; wire it into the module surface chat route on a **fresh** surface conversation only (not a resume).                                                  | `lib/framework/engagement/{record-engagement,vocabulary}.ts`, `app/api/v1/framework/modules/[slug]/chat/stream/route.ts` (edit), `tests/…`                                                                                                    | —    | **done**  | #103 |
| t-2  | **`record_feedback` capability + the plain feedback API.** A `RecordFeedbackCapability extends BaseCapability` (`processesPii` + `redactProvenance` masking the comment) resolving `moduleSlug` from `context.scope`; registered via a new `engagementCapabilities` array in `initFramework()`. `POST /api/v1/framework/modules/[slug]/feedback` (`withAuth`, mutation-capped). Both write `module.feedback` via t-1's seam.                        | `lib/framework/engagement/capabilities/{record-feedback,index}.ts`, `lib/framework/engagement/vocabulary.ts` (add `module.feedback`), `lib/framework/index.ts` (register), `app/api/v1/framework/modules/[slug]/feedback/route.ts`, `tests/…` | t-1  | **done**  | #105 |
| t-3a | **Admin module stats query + endpoint (the read API).** `getModuleStats(slug, filter?)` aggregating `JourneyEvent` (unique users / entries / completions / returning users / ratings summary) from the stream (A9), subject-scope-shaped via an optional `{ userId }` filter; `GET …/modules/[slug]/stats` (`withAdminAuth`, 404 unknown module). Dwell deferred (needs sessionization); no index shipped (not warranted at v1 scale — decision 6). | `lib/framework/engagement/stats.ts`, `app/api/v1/admin/framework/modules/[slug]/stats/route.ts`, `lib/framework/engagement/index.ts`, `tests/…`                                                                                               | t-1  | **done**  | #106 |
| t-3b | **The module-detail Stats tab (UI over the t-3a endpoint).** Append a Stats tab to the module detail `tabs` host (edit the array + thread a server-fetched prop from the page loader); a read-only stats panel (unique users / entries / completions / returning / ratings distribution + recent comments).                                                                                                                                         | `components/admin/framework/module-detail/{module-detail,stats-tab}.tsx` (edit + new), `app/admin/framework/modules/[slug]/page.tsx` (edit), `tests/…`                                                                                        | t-3a | in flight | —    |

**Sizing (B1): 3 PRs.** The board's ~3 holds. t-1 is the anchor (the seam + the one runtime emit + the
binding fire — this is the load-bearing "make bindings fire" deliverable). t-2 is self-contained (one cap

- one endpoint over t-1's seam). **t-3 is the largest** (aggregation query + endpoint + UI tab + a
  possible index migration); if it exceeds the ~600-line budget at build, split along the shipped-vs-new
  seam ([[planning-retro#B25|B25]]) — **t-3a** (the `getModuleStats` query + `GET …/stats` endpoint, the
  security- and correctness-relevant slice) and **t-3b** (the module-detail Stats tab UI over that endpoint)
  — rather than ship an oversized PR. t-2 and t-3 both depend on t-1's seam and are independent of each other.

## Per-task "Done when"

- **t-1** — `recordModuleEngagement` inserts a `JourneyEvent` (`moduleSlug` set, `journeyId` null for
  surface entry) **and** fires `runModuleWorkflowBindings`, with each limb isolated (a binding throw is
  swallowed and never breaks the caller; a write failure doesn't skip the binding fire — asserted); the
  surface route emits `module.entered` **only on a fresh conversation**, not on resume (asserted); the
  new `type` literal lives in the engagement vocabulary; no schema change; **pure framework-tier confirmed
  (no core edit, no migration)**; full gate loop green.
- **t-2** — `record_feedback` validates `{ rating, comment? }`, resolves `moduleSlug` from
  `context.scope` (arg fallback), writes a `module.feedback` event, and `redactProvenance` masks the
  comment (asserted); it is registered from `initFramework()` and its `ai_capability` row syncs
  (`framework-builtin`); `POST …/feedback` is `withAuth`, mutation-capped, and writes the same event; the
  erasure smoke asserts a `module.feedback` event is gone after `eraseUser`; full gate loop green.
- **t-3** — `getModuleStats` returns unique-users / entries / completion / dwell / return / ratings
  computed **from the stream** (a seeded-events test asserts each metric; **no counters**), excludes other
  modules, and accepts a subject-scope filter argument (admin-support = all today); the endpoint is
  `withAdminAuth`; the Stats tab renders on the module detail page over the endpoint (no per-row fetches);
  any added index is `framework_*`-scoped and B13-stripped; a module with no surface/agent shows zero
  entries without error; full gate loop green.

Every task inherits the repo rules ([[CLAUDE|CLAUDE.md]]): `logger` not `console`; `@/` imports; Zod at
boundaries; `withAdminAuth` on the admin stats route / `withAuth` on the feedback route (rate-limiting
automatic via `proxy.ts`, a mutation sub-cap on the feedback write); no new `User` relation (the stream's
`userId` cascade already exists); build in `lib/framework/` only (boundary CI). The emit seam's
**fire-and-forget isolation** (t-1 done-when) is load-bearing — engagement instrumentation must never be
able to break a live chat turn.

## Open questions — genuinely the owner's (flagged, not parked)

- **v1 emit sites.** Default (decision 2): `module.entered` (surface entry) + `module.feedback`; module
  progression/completion is already in the stream via `node_*` events. **Deferred, documented:**
  `session.started` (a broader, module-agnostic signal), `module.progressed`/`module.completed` as
  _distinct_ events (needs a module-completion definition — all nodes? a designated terminal node?), and
  operator `module.status_changed` → workflow trigger (fits `runModuleWorkflowBindings` without a
  `JourneyEvent`, since it has no subject user). _Owner to confirm module-completion semantics before
  promoting `module.completed`._
- **Feedback rating scale.** Default: a **1–5 integer** rating + optional comment (a "ratings
  distribution" implies a scale). Alternative: thumbs `-1/+1` mirroring `AiMessage.rating`. _Default: 1–5;
  owner to confirm._
- **Do journey node events fire workflow bindings?** Default: **no** — bindings fire only from the
  engagement seam (`module.entered`/`module.feedback`), keeping the **pure engine** untouched (`applyEvent`
  stays LLM-free and binding-free per F11). A post-`applyEvent` hook for node-driven triggers is an
  additive later concern, coordinated with f-engine. _Default: engagement-seam-only._
- **Collective journey-heat overlay.** Default: **deferred.** The module-detail Stats tab is the v1
  surface; the journey-explorer "canvas overlay prop" the board imagined **does not exist in shipped code**
  (the explorer's `overlay` is node-status tinting, not an extension slot), so a collective heat/drop-off
  overlay means introducing the prop + an aggregate-by-`nodeKey` query — its own scope. _Default: Stats
  tab only in v1; heat overlay a follow-up._
- **Stats subject-scope.** Default: **admin-only cross-user** (`withAdminAuth`), query shaped to accept a
  subject-scope filter (the #367 analytics axis) so owner/team/cohort views are a later filter. _Default:
  admin cross-user; seam shaped, not wired._

## What this feature deliberately does NOT do

- **It adds no table and no counter.** Every metric is computed from the insert-only `JourneyEvent` stream
  (A9); the only new persistent surface is new `type` string values, which are not migrations (X1).
- **It never edits the pure engine.** `applyEvent` stays LLM-free and binding-free; workflow bindings fire
  only from the engagement seam.
- **It writes no operator-lifecycle event to the per-user stream.** Status changes have no subject user
  and stay out of the erasable engagement log.
- **It seeds nothing.** A fresh Daybreak fork boots with an empty stream and empty stats; events accrue
  only as real users engage.

## Reference

- [[f-module-core]] — the module spine this instruments; reserved the `JourneyEvent` stream + stats for here.
- [[f-journey-state]] — created the shared `JourneyEvent` table + the `userId`-keyed erasure path this reuses.
- [[f-module-bindings]] — shipped `runModuleWorkflowBindings` (the receiver this feature finally wires) + the surface-scope seam.
- [[f-guidance]] — shipped the module surface chat route (the `module.entered` emit site).
- [[building-a-feature]] — the execution rhythm (claim-first docs PR → per-task gate loop → close-out).
- [[framework-architecture]] — §4.3 (stats & engagement) + A9 (stream, never counters), X1 (free-form `type`).
- [[planning-retro]] — B1 (fold commit-sized slivers), B17 (confirm pure-framework-tier at build), B25 (size a new-endpoint+UI task at build).

---
name: f-overlays
feature: 19 · f-overlays
epic: Framework v1
status: in flight (dep f-guidance shipped ✅) — planned, tasks promoted
owner: John
depends_on: f-guidance (shipped — the guidance service this extends; the `RankedMove.related` seam was pre-stubbed here for #19) · reuses Sunrise-core embeddings (`embedText`/`embedBatch` + pgvector/HNSW), the scheduler (`AiWorkflowSchedule` + `registerStepType`), and email (`sendEmail`)
spec: framework-architecture.md §5.4 (guidance — advisory overlays) · Appendix A — F9 (authored edges alone drive eligibility; similarity is advisory) · F13 (proactive guidance)
parent: plan.md
opened: 2026-07-07
planned: 2026-07-07
---

# f-overlays — similarity overlays + proactive guidance

> Feature-level build plan for **`f-overlays`** (19). Parent: [[plan#19 · `f-overlays`|plan.md]].
> **The deferred F9/F13 half of [[f-guidance]] (12)** — that feature shipped a labelled-empty `related`
> slot and deferred pgvector "related" + proactive guidance to here. **Build-ready** — reconciled
> against repo reality (a reconnaissance sweep of the embedding/pgvector infra, the guidance service +
> map-node shape, and the scheduler/hooks/notification paths, 2026-07-07). Sizing: **task = one PR**
> (~200–600 lines), **3 PRs**.

## Intent

Two advisory overlays on top of the shipped guidance layer (spec §5.4), both strictly **downstream of
eligibility** (F9 — _authored edges alone drive what is available; nothing computed ever gates_):

1. **Similarity "related places"** — embed each authored map node once, and let guidance suggest
   thematically-nearby nodes (pgvector cosine) to enrich the conversation, **clearly labelled
   advisory**. This fills the `RankedMove.related` slot `f-guidance` deliberately left empty for #19.
2. **Proactive guidance (F13)** — a scheduled sweep re-runs the (LLM-free) guidance evaluation over
   active journeys and nudges a user toward their next step when they've stalled.

The embedding, pgvector, scheduling, and email machinery is **entirely Sunrise-core**; this feature is
the thin framework adapter that composes node text, stores/queries node embeddings, and wires the
advisory results into guidance + a proactive sweep. **Reuse over reinvention** (F14 discipline applied
here too).

## Reconciliation with repo reality — the design decisions (settled 2026-07-07)

Organising principle: **respect the F9 boundary absolutely**, **reuse core infra**, **ship nothing a
fork has to delete**, **confirm "pure framework-tier" at build** ([[planning-retro#B17|B17]]).

1. **The `RankedMove.related` seam is already stubbed for this feature — fill it downstream of
   `rankMoves`, never touching availability (F9).** Guidance lives in `lib/framework/guidance/`
   (_not_ under `facilitation/`). `loadGuidance(viewer, key, scope?)`
   ([`guidance/guidance.ts`](../../lib/framework/guidance/guidance.ts)) assembles context → calls the
   pure `computeAvailability` (the engine's "what is possible") → `rankMoves`
   ([`guidance/ranking.ts`](../../lib/framework/guidance/ranking.ts), pure) over the
   **already-eligible** `validMoves`. `RankedMove.related: readonly NodeKey[]` is set literally to `[]`
   at `ranking.ts:152` and commented as the f-overlays seam. **F9 is enforced in three files** —
   `computeAvailability` takes no similarity input
   ([`engine/availability.ts`](../../lib/framework/facilitation/engine/availability.ts): _"pgvector
   similarity is never an input (F9)"_; `related_to` edges are filtered out of the structural gate),
   and `GraphStore` is a pure authored-edge multigraph
   ([`engine/graph-store.ts`](../../lib/framework/facilitation/engine/graph-store.ts): _"pgvector
   similarity is never a topology input"_). **Keep all similarity work strictly downstream of
   `computeAvailability` — read node embeddings into the `related`/advisory layer only, never into
   `AvailabilityInput`, `GraphStore`, or `validMoves`/`perNode`.** The `related` field already
   serialises through `get_next_steps`, so no capability signature changes.

2. **Map nodes are JSON inside `FacilitationGraphVersion.definition`, not DB rows — so the embedding
   table keys on `(graphSlug, nodeKey, version)`, and the source text must be _composed_.** There is
   no `framework_node` table; nodes live in the immutable published-version snapshot
   ([`framework-facilitation.prisma`](../../prisma/schema/framework-facilitation.prisma), `definition:
Json`), read via `getPublishedGraph(slug)`
   ([`engine/published-graph.ts`](../../lib/framework/facilitation/engine/published-graph.ts)) →
   `GraphStore.nodes()`. `MapNode` ([`map/schema.ts`](../../lib/framework/facilitation/map/schema.ts))
   has **no `label`/`description`** — only `key`, `type`, optional `moduleSlug`/`stage`/`region`/`meta`.
   So the embed text is **assembled**: `key` + (for `module` nodes) the registered module's `name` +
   `description` (from `getRegisteredModules()`, the way `modules/context.ts` already reads them) +
   `stage`/`region`/relevant `meta`. Key the store on `(graphSlug, nodeKey, version)` (the monotonic
   published `version`), so republishing mints a new version and **naturally invalidates** stale
   embeddings — a similarity query for the current version simply finds no rows until re-embedded, and
   `related` stays empty (safe, advisory). No `userId` on this table → **no erasure hook** (authored
   config, like the map itself).

3. **Reuse the core embedding + pgvector infra verbatim; carry provenance + a dimension drift-guard.**
   Embed via `embedText` / `embedBatch`
   ([`knowledge/embedder.ts`](../../lib/orchestration/knowledge/embedder.ts)) — 1536-dim, and they
   **self-log cost** (`CostOperation.EMBEDDING`), so f-overlays makes no manual `logCost` call. The
   vector column is `Unsupported("vector(1536)")` (structural template: `AiMessageEmbedding` in
   [`orchestration-conversations.prisma`](../../prisma/schema/orchestration-conversations.prisma)); the
   **HNSW index is hand-appended** to the migration (Prisma can't emit `USING hnsw`): `CREATE INDEX
"idx_framework_node_embedding" ON "framework_node_embedding" USING hnsw ("embedding"
vector_cosine_ops) WITH (m = 16, ef_construction = 64);`. Store `embeddingModel` /
   `embeddingProvider` / `embeddingDimension` provenance columns and mirror
   `assertActiveModelMatchesStoredVectors()` (search.ts) — a query after a model/dim change must fail
   loudly with "re-embed", not crash on the `$N::vector` cast. Similarity query is raw SQL
   (`prisma.$queryRawUnsafe`), cosine `<=>`, query vector bound as a `[..]` string cast `$1::vector`,
   ordered ascending, `LIMIT k`, gated by a distance threshold (knowledge uses `0.8`). Write via
   `$executeRawUnsafe` `INSERT … ON CONFLICT (…) DO UPDATE` (the `message-embedder.ts` pattern).
   Migration is `--create-only`, `framework_*`-scoped (B13) — **and this is the first framework
   migration to _add_ its own HNSW index**, so on top of the usual "strip the spurious pgvector/tsvector
   `DROP INDEX`" step it must also **hand-append the `CREATE … USING hnsw`**.

4. **The framework's first drift probe needs a new third bridge — `lib/app/db-drift.ts` →
   `lib/framework/db-drift.ts` + reserved-empty `lib/app/leaf-db-drift.ts`.** Sunrise-core
   `scripts/db/check-drift.ts` calls `registerAppDriftProbes()` from the fork-owned scaffold
   [`lib/app/db-drift.ts`](../../lib/app/db-drift.ts) (currently empty). Per the CLAUDE.md banner,
   `lib/app/*` is the **leaf-reserved** surface Daybreak keeps empty — filling it with framework probes
   would collide with a leaf's own probes on upgrade. So this is the **same situation the
   `bootstrap.ts` / `admin-nav.ts` bridges solve**: Daybreak fills `lib/app/db-drift.ts` as a **third
   bridge** that (a) calls a framework-owned `registerFrameworkDriftProbes()` in a new
   `lib/framework/db-drift.ts` (which registers the HNSW probe via `registerAppDriftProbe({ …, probe:
indexExists('idx_framework_node_embedding') })`) and (b) delegates to a leaf-reserved
   `lib/app/leaf-db-drift.ts` (`registerLeafDriftProbes()`, shipped empty). This mirrors exactly how
   `f-ops-views` t-1 wired client nav (`lib/app/admin-nav.ts → lib/framework/admin-nav.ts →
lib/app/leaf-admin-nav.ts`) and becomes the reusable seam for any future framework unmodelled object.

5. **Embedding trigger is on-demand (admin), not auto-on-publish, for v1.** Embeddings cost money and
   maps change rarely; an admin **re-embed trigger** (`POST
/api/v1/admin/framework/maps/[slug]/embeddings`) that embeds the currently-published version's nodes
   is the cost-controlled, publish-decoupled choice (mirrors [[f-eval]]'s on-demand scoring decision).
   Staleness is safe by construction (decision 2 — version-keyed → graceful empty `related`).
   _Auto-embed-on-publish is a documented follow-up_ (it would couple `publishDraft` to embedding cost).

6. **Proactive guidance rides an operator-scheduled AiWorkflow through a framework-registered custom
   step type — there is no framework periodic seam.** The maintenance tick
   ([`maintenance/run-tick.ts`](../../lib/orchestration/maintenance/run-tick.ts)) is Sunrise-owned with
   a hard-coded task array and **no contributor hook**, and `AiWorkflowSchedule`
   ([`scheduling/scheduler.ts`](../../lib/orchestration/scheduling/scheduler.ts)) fires **one execution
   with static input per tick** — it does not fan out per journey. So the fork-lawful path is a
   **framework-registered custom step type** `registerStepType('framework_proactive_guidance', handler)`
   (the exact seam `send_notification` uses via
   [`engine/executor-registry`](../../lib/orchestration/engine/executor-registry.ts)); the sweep loop
   lives inside that step. Ship the **step type + a reusable `runProactiveGuidanceSweep()` service + an
   on-demand admin trigger**; an operator wires a one-node workflow + cron `AiWorkflowSchedule` to run
   it. **Do NOT seed a workflow/schedule row** (a fresh fork boots clean — no data to delete). A
   fork-carried `run-tick.ts` seam is the heavier fallback only if the step-type route proves
   unworkable ([[planning-retro#B19|B19]], ledgered [[upstream-asks]]).

7. **Active-journey enumeration is a new system-scoped query; run guidance per journey under a
   self-viewer.** No cross-user journey query exists — `journey/queries.ts` is entirely per-subject and
   `canRead`-guarded. The sweep needs a new `prisma.userJourney.findMany(...)` enumerator; **"active"
   is derived** (`UserNodeState.status === 'active'` and/or recent `lastActiveAt` — there is no `active`
   flag on `UserJourney`). Run `loadGuidance` per journey with viewer `{ userId: journey.userId }` —
   `canRead` passes trivially (self-read), so **no new admin-support viewer is needed**
   ([`shared/access.ts`](../../lib/framework/shared/access.ts)).

8. **Nudge delivery is email to the journey owner (no in-app store exists); deterministic copy; a new
   throttle table dedups re-nudging.** There is no in-app notification store — delivery is `sendEmail`
   ([`lib/email/send.ts`](../../lib/email/send.ts)) or an outbound webhook. For a nudge to the _journey
   owner_, resolve `User.email` by `journey.userId` and render an extended
   [`emails/event-notification.tsx`](../../emails/event-notification.tsx). Guidance is **LLM-free**, so
   nudge copy is **deterministic** for v1 (proactive guidance stays cost-free). A new
   `framework_journey_nudge` table (`userId` FK **`ON DELETE CASCADE`** — GDPR, the journey-table
   convention) records last-nudged-at so a 60s tick doesn't re-nudge; a per-run journey cap bounds email
   volume.

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                                                                                                                                       | Files (indicative)                                                                                                                                                                                                                                                                                     | Deps | Status  | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------- | --- |
| t-1 | **Node-embedding store + sync + on-demand trigger + drift bridge (anchor).** `FrameworkNodeEmbedding` model (`vector(1536)` + hand-appended HNSW) + `--create-only` migration; the node-text composer (extract nodes from the published version, compose `key` + module name/desc + meta); the embed+upsert sync service (`embedBatch`); the `POST …/maps/[slug]/embeddings` admin trigger; the drift bridge (decision 4). | `prisma/schema/framework-facilitation.prisma`, `prisma/migrations/…`, `lib/framework/facilitation/overlays/{node-text,embed-sync,queries}.ts`, `lib/framework/db-drift.ts`, `lib/app/db-drift.ts`, `lib/app/leaf-db-drift.ts`, `app/api/v1/admin/framework/maps/[slug]/embeddings/route.ts`, `tests/…` | —    | backlog | —   |
| t-2 | **Similarity → the `related` advisory slot in guidance (F9-safe).** A `findRelatedNodes(graphSlug, nodeKey, k)` cosine query (with the dimension drift-guard) + wire it into `loadGuidance` to fill `RankedMove.related` downstream of `rankMoves`, labelled advisory, never feeding availability; graceful-empty when no embeddings.                                                                                      | `lib/framework/facilitation/overlays/queries.ts`, `lib/framework/guidance/guidance.ts`, `lib/framework/guidance/ranking.ts` (seam already present), `tests/…`                                                                                                                                          | t-1  | backlog | —   |
| t-3 | **Proactive guidance: scheduled sweep + nudge (F13).** A system-scoped active-journeys enumerator + `runProactiveGuidanceSweep()` (per journey: `loadGuidance` under a self-viewer → stall/next-step signal) + the `framework_journey_nudge` throttle table (+ migration) + email nudge (extend `event-notification.tsx`) + `registerStepType('framework_proactive_guidance')` + an on-demand admin trigger.               | `prisma/schema/framework-facilitation.prisma`, `prisma/migrations/…`, `lib/framework/facilitation/overlays/{active-journeys,proactive-sweep,nudge}.ts`, `lib/framework/facilitation/overlays/proactive-step.ts`, `emails/…`, `app/api/v1/admin/framework/…/route.ts`, `tests/…`                        | t-1  | backlog | —   |

**Sizing (B1): 3 PRs.** The board's ~3 holds. t-1 is the anchor (store + the reusable drift-bridge
seam). t-2 is small and self-contained (one query + one wiring point into a pre-stubbed slot). **t-3 is
the largest** (enumerator + sweep + throttle table + email + step type + trigger); if it exceeds the
~600-line budget at build, split along the cleanest seam — **t-3a** (enumerator + `runProactiveGuidanceSweep`

- on-demand trigger, deterministic, no delivery) and **t-3b** (throttle table + email nudge +
  `registerStepType`) — rather than ship an oversized PR. t-2 depends on t-1's store; t-3 depends on t-1
  (the store) but not t-2.

## Per-task "Done when"

- **t-1** — `FrameworkNodeEmbedding` migrates clean (`--create-only`; spurious pgvector/tsvector `DROP`s
  stripped **and** the `CREATE … USING hnsw` hand-appended; `db:drift-check` green with the new probe
  registered through the bridge); the composer + sync produce one embedding row per node of the
  published version, idempotent on re-run; the admin trigger re-embeds on demand and is `withAdminAuth` +
  audited; a fresh fork boots to an **empty** embedding table; full gate loop green.
- **t-2** — `findRelatedNodes` returns top-K by cosine within threshold, excludes self, and passes the
  dimension drift-guard; `loadGuidance` fills `RankedMove.related` **only** downstream of
  `computeAvailability` (a test asserts availability/`validMoves` are byte-identical with and without
  embeddings present — the F9 guarantee); no embeddings ⇒ `related: []` (no crash); full gate loop green.
- **t-3** — the enumerator lists active journeys system-wide (derived "active"); the sweep runs guidance
  per journey under a self-viewer and yields nudge candidates; the throttle table prevents re-nudging
  within the window (`userId` FK `ON DELETE CASCADE`, erasure-smoke asserted); the email renders + sends
  via `sendEmail`; `registerStepType('framework_proactive_guidance')` is registered from
  `initFramework()` and the on-demand trigger runs the sweep; **no workflow/schedule row is seeded**;
  full gate loop green.

Every task inherits the repo rules ([[CLAUDE|CLAUDE.md]]): `logger` not `console`; `@/` imports; Zod at
boundaries; `withAdminAuth` on the admin routes (rate-limiting automatic via `proxy.ts`); a new
`userId` relation needs an `onDelete` policy (t-3's throttle table → `Cascade`, hand-written FK per X6);
build in `lib/framework/` only (boundary CI). The **F9 invariant test** (t-2 done-when) is the
load-bearing guard for this whole feature — similarity must never move eligibility.

## Open questions — genuinely the owner's (flagged, not parked)

- **Embedding trigger — on-demand vs auto-on-publish.** t-1 ships an **on-demand** admin re-embed
  (decision 5). Auto-embed on `publishDraft` is a clean later add (a post-publish call), at the cost of
  coupling publish to embedding spend. _Default: on-demand v1; auto-on-publish deferred._
- **Nudge channel — email-to-owner vs outbound webhook.** Default **email to the journey owner**
  (decision 8); an outbound-webhook/hook channel (for Slack/etc. integrations) is an additive later
  option. _Default: email; webhook deferred._
- **Nudge copy — deterministic vs LLM-phrased.** Guidance is LLM-free, so **deterministic** keeps
  proactive guidance cost-free (decision 8). LLM-phrased copy would add per-user model cost + a budget
  concern. _Default: deterministic v1._
- **What counts as "nudge-worthy".** Proposed default: a **stalled** active journey (no `JourneyEvent`
  for _N_ days, `N` a settings knob) that has **≥1 eligible move** → nudge the top-ranked next step.
  Alternatives (a newly-unlocked high-value node; a soft-deadline approaching) are additive signals.
  _Default: stalled-with-an-eligible-move; owner to confirm the signal + `N`._

## What this feature deliberately does NOT do

- **It never changes eligibility.** Similarity and proactive nudges are advisory only (F9). The `related`
  slot and the nudge copy are the only new surfaces; `computeAvailability`/`GraphStore`/`validMoves` are
  untouched.
- **It ships no seeded workflow, schedule, or embedding data.** A fresh Daybreak fork boots clean; the
  operator embeds maps and schedules the sweep when they want it.
- **It adds no per-user embeddings.** Embeddings are per authored node (config-derived); the only
  per-user data is the `framework_journey_nudge` throttle row (erasable via cascade).

## Reference

- [[f-guidance]] — the feature this extends; shipped the `related` seam + the LLM-free guidance service.
- [[building-a-feature]] — the execution rhythm (claim-first docs PR → per-task gate loop → close-out).
- [[framework-architecture]] — F9 (advisory overlays never gate) + F13 (proactive guidance), Appendix A.
- [[planning-retro]] — B13 (the framework-migration pgvector DROP-strip; here also a CREATE-append),
  B17 (confirm pure-framework-tier at build), B19 (the fork-carried core seam as last resort).

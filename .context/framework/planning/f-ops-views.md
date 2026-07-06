---
name: f-ops-views
feature: 15 · f-ops-views
epic: Framework v1
status: in flight
owner: Simon Holmes
depends_on: f-module-config (shipped — #56 · #58) · f-module-bindings (shipped — #33 · #35 · #50 · #53) · f-journey-state (shipped — #27 · #28)
spec: framework-architecture.md §4.4 (module admin) + §5.6 (journey views) + Appendix A (A4 generic form · A6 bindings) + X2 (canRead)
parent: plan.md
opened: 2026-07-06
---

# f-ops-views — module admin + journey explorer

> Feature-level build plan for **`f-ops-views`**, the operational admin surfaces of the framework.
> Parent: [[plan#15 · `f-ops-views` — module admin + journey explorer|plan.md]].
> Binding _how_: [[framework-architecture#4. Modules|§4.4]] (module admin) + [[framework-architecture#5. Facilitation Structures|§5.6]] (journey views) + Appendix A (A4 generic config form, A6 bindings) + X2 (`canRead`). Sizing follows the parent plan: **task = one PR** (~200–600 lines, cohesive, reviewable); commits sit below this resolution.

## Intent

Three shipped features built their **read/write APIs API-first and deferred their UI here** — the same split `f-module-core` made (read API in 03, module page here):

- **`f-module-core` (03)** shipped `GET /modules` and deferred the module **list + detail pages**.
- **`f-module-config` (06)** shipped the config-validation + version engine (the `describeConfigSchema` walker → `FieldDescriptor[]`, `GET/PUT /config`, `GET /versions`, `POST /versions/[version]/restore`) and deferred the **client generic-config form + version-history tab**.
- **`f-module-bindings` (07)** shipped the agent/workflow/knowledge binding APIs and deferred their **management views**.

This feature is where a human operator first _sees and drives_ a module: browse the registered modules, edit a module's operator config against its own schema, manage its bindings, change its lifecycle, and inspect how individual users have travelled the facilitation map. It is the framework's **first admin UI** — so it also stands up the framework admin section in the sidebar (the nav seam, §below) and the `app/admin/framework/` route tree that every later admin feature (14, 16) hangs pages off.

## The pivotal shape decisions (read this first)

Three decisions shape the whole feature. Each is settled; the reasoning is here so a reviewer (or a resumed session) doesn't relitigate it.

### 1. Scope — the 08-independent core (the "08 question", settled)

The board's original task-1 sketch bundled `f-engagement` (08) deliverables — "**stats from the event stream**", the journey explorer's "**collective heat, drop-off overlays**". Those are 08's **stats-from-the-stream** (A9), which **has not shipped** and has **no dependency edge** into 15. Building them here would either block 15 on 08 or fabricate an analytics layer 08 then supersedes. So **15 is built to its 08-independent core**:

- **In scope:** module list/detail, the generic config form (over 06), binding management views (over 07), module **lifecycle writes** (the module PATCH/DELETE endpoints, which don't exist yet), and a **structural** journey explorer — the read-only map + **individual-journey replay** (which works _now_: `f-engine` already writes `enter`/`complete` events per node).
- **Out of scope, moved to `f-engagement` (08):** the analytics **surfaces** — a module-stats tab (users, completion, dwell, return, ratings) and the explorer's collective **heat / drop-off overlays**. They are computed from 08's stream aggregation and belong in the same cohesive vertical as the engine that produces them.

**Principle — host-first, overlay-plugs-in.** A UI overlay depends on its **host surface** more than the host depends on the overlay's **data source**. 15 builds the hosts (the module detail page; the journey canvas) and **leaves the extension points**: the detail page is a **tab array** (08 adds a "Stats" entry), the explorer canvas takes an **overlay prop** (08 adds a heat layer). 08's new engagement event kinds are free-form `JourneyEvent.type` strings (X1) — they flow into the explorer's timeline with **zero rework** and no schema change. So the surface dependency (overlay → host) orders the build, and 15-before-08 is the clean order — the same read-API-here / UI-there move 03/06/07 already made, one level up.

### 2. The nav seam — how the framework section reaches the admin sidebar (the crux)

`app/admin/framework/` does not exist yet — 15 is the first framework admin page, so it must make the "Framework" section appear in the admin sidebar. **This needs no Sunrise core change** (verified 2026-07-06):

- Sunrise's `components/admin/admin-sidebar.tsx` (`'use client'`) **already** imports `initAppNav()` from the empty, fork-owned `lib/app/admin-nav.ts`, calls it once at module-eval (line 59), and renders `[...coreNavSections, ...getRegisteredNavSections()]` (line 497). Its comment **explicitly sanctions** a fork populating the registry there: _"a fork's `registerNavSection()` calls in `lib/app/admin-nav.ts` populate the registry before `getRegisteredNavSections()`."_
- `registerNavSection(section: NavSection)` (`lib/admin-nav/registry.ts:68`) dedupes by `title`; `NavSection = { title, items?: NavItem[] }`, `NavItem = { href, label, icon }` (`icon: ComponentType<{ className?: string }>`).

**Design — the boot-seam (#385) pattern applied to client nav** (mirrors `lib/app/bootstrap.ts` → `initFramework()` → `lib/app/leaf-bootstrap.ts`):

- **New `lib/framework/admin-nav.ts`** — `initFrameworkNav()` calls `registerNavSection({ title: 'Framework', items: [{ href: '/admin/framework/modules', label: 'Modules', icon: … }] })`. **Must be client-safe** — registrar + `lucide-react` icon imports only, **no server code** (it runs inside the client `admin-sidebar` bundle). A `title` distinct from the core sections.
- **Fill `lib/app/admin-nav.ts`** — `initAppNav()` calls `initFrameworkNav()`, then delegates to `initLeafAdminNav()`.
- **New `lib/app/leaf-admin-nav.ts`** — leaf-reserved scaffold, `initLeafAdminNav()` a no-op by default (mirrors `leaf-bootstrap.ts`; a leaf fork fills it to add its own sections).

**Static import, not the dynamic-import trick `bootstrap.ts` uses.** Nav registration is **synchronous** (it must run at module-eval, before `getRegisteredNavSections()` is read during render) so it cannot `await` a dynamic import. A static `import { initFrameworkNav } from '@/lib/framework/admin-nav'` from `lib/app/admin-nav.ts` is safe here because (a) `lib/app/**` is the sanctioned core→framework bridge and **X6-boundary-exempt**, and (b) the reference lives only in Daybreak's _filled_ copy — vanilla Sunrise ships the empty `admin-nav.ts` (no framework import), and every Daybreak leaf fork has the `lib/framework/` folder, so the specifier always resolves. (`bootstrap.ts` uses dynamic import because it runs in an async boot context and could afford to; nav can't.) This is the **second `lib/app/*` file Daybreak fills** (after `bootstrap.ts`).

### 3. Which endpoints this feature _builds_ vs _consumes_

Most of 15 is **UI over already-shipped APIs**; two tasks **build new endpoints**. The task split (§Tasks) is drawn on exactly this seam so each PR is one or the other, and the endpoint-building tasks (the ones with a real trust boundary + the security-sensitive invalidation) get isolated review.

**Consumes (all shipped, `withAdminAuth`, framework-tier):**

| Endpoint                                                    | Shipped in | 15 surface                           |
| ----------------------------------------------------------- | ---------- | ------------------------------------ |
| `GET /modules` → `Module[]`                                 | 03 (#12)   | t-1 list page                        |
| `GET /modules/[slug]/config` → `{ descriptors, values }`    | 06 (#58)   | t-2 Config tab (renders descriptors) |
| `PUT /modules/[slug]/config`                                | 06 (#58)   | t-2 Config tab (save)                |
| `GET /modules/[slug]/versions` · `POST …/[version]/restore` | 06 (#58)   | t-2 Versions tab                     |
| `GET/POST/PATCH/DELETE /modules/[slug]/agents[/id]`         | 07 (#33)   | t-4 Agents tab                       |
| `…/workflows[/id]`                                          | 07 (#50)   | t-4 Workflows tab                    |
| `GET /modules/[slug]/knowledge` · `POST` · `DELETE`         | 07 (#53)   | t-4 Knowledge tab                    |

**Builds (new — the endpoints 15 owns):**

- **`PATCH /modules/[slug]`** (t-3) — edit the universal operator controls (status / audience / feature-flag name / availability window / display name). No module **write** service exists — only `listModules()` (`lib/framework/modules/queries.ts:22`) — so t-3 adds the write service fn + route.
- **`DELETE /modules/[slug]`** (t-3) — hard-delete a module row. **Must call `invalidateAllAgentAccess()`** (`lib/orchestration/knowledge/resolveAgentDocumentAccess.ts:57`): the DB cascade drops the module's binding/knowledge pivots but runs **no app code**, so the 60 s per-agent access cache would keep serving revoked module knowledge (the invalidation gap [[f-module-bindings]] recorded for this feature).
- **Journey read endpoints** (t-5) — none exist. Built over 09's `canRead`-guarded lib queries `getJourney` / `getNodeStates` / `getJourneyTimeline` (`lib/framework/facilitation/journey/queries.ts`), constructing the viewer as `{ userId, isAdminSupport: true }` from the admin session **explicitly** (not `role === 'ADMIN'`) — `canRead` honours `isAdminSupport` (`access.ts:108`) to let an operator see other users' journeys while #366/#367 are unlanded. Plus a **journey list** endpoint (enumerate journeys for the explorer's picker) — confirm at build whether it composes existing queries or needs a small `listJourneys` added to the framework query module.

## Reconciliation with current repo reality

Verified against the tree on 2026-07-06 (per [[planning-retro#B2]] — reconcile against code, not the spec sketch):

1. **Canvas is `@xyflow/react` v12, _not_ a custom canvas.** The parent board's feature-14 note ("Sunrise's workflow builder is a custom canvas, not React Flow, verified June 2026") is **wrong** — re-verified against `package.json` (`@xyflow/react ^12.11.1`) and `components/admin/orchestration/workflow-builder/workflow-canvas.tsx` (`ReactFlow`, `useReactFlow`, `ReactFlowProvider`, `Background`/`Controls`/`MiniMap`). t-5 **reuses those primitives in read-only mode** (drop the drag/connect handlers) and writes a journey-graph mapper analogous to `workflow-mappers.ts`. (Correction also applied to feature 14's note in `plan.md`.)
2. **No module write service exists** — `lib/framework/modules/queries.ts` has `listModules()` only; t-3 builds `updateModule` / `deleteModule` (the write half).
3. **Nav seam is a fork-fill, no core change** — confirmed against `admin-sidebar.tsx` + `lib/admin-nav/registry.ts` (§decision 2). `lib/app/admin-nav.ts` already exists empty with the exact `initAppNav()` shape.
4. **Thin-server-page pattern is established** — `app/admin/orchestration/capabilities/page.tsx` is the canonical shape: a server component pre-renders via `serverFetch` + `parseApiResponse`, hands `initial*` data to a `'use client'` table/detail component, and **never throws** on fetch failure (renders an empty state). `components/ui/{table,tabs}` + `<FieldHelp>` (`components/ui/field-help.tsx`) + `apiClient.{get,post,patch,delete}` (`lib/api/client.ts`) for client mutations. `agent-form.tsx`'s multi-tab detail is the model for the module detail page.
5. **Framework endpoint constants** — `lib/api/endpoints.ts` (the core `API` object) has **no** framework entries and is Sunrise-owned; **don't edit it**. t-1 introduces a small **framework-owned** path-constants module (e.g. `lib/framework/admin/endpoints.ts`) — or the pages use literal `/api/v1/admin/framework/…` paths. Decide at t-1 (lean: a framework-owned constants module, so t-2–t-5 share it).
6. **Theming is automatic** for `/admin/**` (the `data-surface` seam classifies admin surfaces) — nothing to do.
7. **X2 access queries are shipped and admin-support-ready** — `canRead` returns `true` and `subjectScope` returns `{}` for an `isAdminSupport` viewer; the queries gate-before-Prisma. #366/#367 unlanded, so cross-user visibility is admin-support-only (expected for a single-tenant operator console).

## Framework-tier assessment — expected pure, confirm at build (B17)

Every piece lives in the **framework tier**: pages under `app/admin/framework/`, components under `components/` (framework-owned segments), services/queries/endpoints under `lib/framework/`, and the two nav-seam files in the sanctioned `lib/app/*` bridge. The two endpoint pairs 15 builds (module lifecycle writes; journey reads) are framework routes consuming core only through the allowed direction (`withAdminAuth`, `getClientIP`, `invalidateAllAgentAccess`, `logAdminAction`, the module registry). **No new migration** (t-3 writes existing `Module` columns; t-5 reads existing tables). So the current expectation is **pure framework-tier, no upstream Sunrise issue** — but per [[planning-retro#B17]] that is a _build-time finding, not a plan-time fact_: confirm at each task, and if correct behaviour needs a core seam (as `f-module-bindings` t-4 found), build it fork-first and ledger the upstream ask.

## Test strategy (house style)

Vitest on `happy-dom`, **no live DB** ([[f-module-core]] reconciliation note): unit/integration tests mock `@/lib/db/client` and forward `executeTransaction` to a `tx` mock; real-DB fidelity is via `smoke:*`, never vitest-against-dev-DB (retro B9). This feature adds **component tests** — `@testing-library/react` + `user-event` + `jest-dom` are present and the pattern exists under `tests/integration/app/admin/**/page.test.tsx` (e.g. `…/orchestration/capabilities/page.test.tsx`). Concretely:

- **Nav seam** (t-1) — unit test that `initAppNav()` registers a `Framework` section with a `/admin/framework/modules` item (registry populated), and that `initFrameworkNav` is client-safe (no server import pulled in). Delegation to the empty `initLeafAdminNav()` is a no-op.
- **Pages/components** (t-1, t-2, t-4, t-5) — render with `@testing-library/react`, **mock `apiClient` / `serverFetch`** (happy-dom has no network): the list renders rows from mocked `GET /modules` + an empty state on failure; the config tab renders one input per `FieldDescriptor` type + a JSON fallback field + `<FieldHelp>`, and `PUT` is called with the edited values; the versions tab lists + fires restore; binding tabs list + add + remove; the explorer renders nodes from a mocked journey + steps the replay.
- **New endpoints** (t-3, t-5) — the established **mocked-prisma + `withAdminAuth`** contract tests: admin-guard (401/403, DB untouched), Zod body/param validation (422/400), `PATCH` writes the allowed fields only, `DELETE` **asserts `invalidateAllAgentAccess()` is called**, journey routes construct the `{ isAdminSupport: true }` viewer and 404/403 correctly. Contract tests live at the conventional API path (no `@/lib/framework` import); any e2e importing framework fns lives at the boundary-exempt `tests/**/lib/framework/**` path.

## Tasks (promoted)

| ID  | Task                                                                                                 | Files                                                                                                                                                                                                                                   | Deps | Status        | PR  |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------- | --- |
| t-1 | **Framework admin scaffolding + nav seam + module list page**                                        | `lib/framework/admin-nav.ts` (new), `lib/app/admin-nav.ts` (fill), `lib/app/leaf-admin-nav.ts` (new, empty), `lib/framework/admin/endpoints.ts` (new), `app/admin/framework/modules/{page,components}`, `tests/…`                       | —    | **available** | —   |
| t-2 | **Module detail shell (tabbed) + Config tab + Versions tab** (UI over 06)                            | `app/admin/framework/modules/[slug]/{page,layout?}`, `components/admin/framework/module-detail/*` (tabbed shell, config-form renderer, versions list), `tests/…`                                                                        | t-1  | **backlog**   | —   |
| t-3 | **Module lifecycle writes** — `PATCH` + `DELETE /modules/[slug]` + Settings tab + danger-zone delete | `lib/framework/modules/{service,api-schemas}.ts` (new write fns), `app/api/v1/admin/framework/modules/[slug]/route.ts` (PATCH/DELETE), `components/admin/framework/module-detail/settings-tab.tsx`, `tests/…`                           | t-2  | **backlog**   | —   |
| t-4 | **Binding management tabs** — Agents / Workflows / Knowledge (UI over 07)                            | `components/admin/framework/module-detail/{agents,workflows,knowledge}-tab.tsx`, `tests/…`                                                                                                                                              | t-2  | **backlog**   | —   |
| t-5 | **Journey explorer** — journey read endpoints + read-only canvas + individual replay                 | `lib/framework/facilitation/journey/{admin-queries?,api-schemas}.ts`, `app/api/v1/admin/framework/journeys/**` (new), `app/admin/framework/journeys/{page,components}`, `components/admin/framework/journey-explorer/*` (canvas+mapper) | t-1  | **backlog**   | —   |

**Five promoted PRs — one more than the parent plan's indicative `~4`.** The board's 4 bundled in the 08 analytics now moved out (§decision 1); the remaining work is genuinely five cohesive PRs because 15 builds two new endpoint pairs (module writes, journey reads) plus three distinct UI surfaces (list, detail-with-config, bindings) plus the explorer. The split is drawn on the **UI-over-shipped-API vs builds-one-new-endpoint** seam so each PR is one kind — and the security-sensitive `DELETE` + invalidation is isolated in t-3 for focused review, not buried in a binding-UI PR. **Dependency shape:** t-2 ships the tabbed detail **host** (the tab array); t-3 and t-4 each **add a tab entry** to it (the host-first extension point — minimal churn, one array entry each). t-4 and t-5 are independent of each other and of t-3, so after t-2 the last three can proceed in any order (or parallel).

### t-1 · Framework admin scaffolding + nav seam + module list page

Stand up the framework admin section and its first page.

- **Nav seam** (§decision 2) — `lib/framework/admin-nav.ts` (`initFrameworkNav()` → `registerNavSection({ title: 'Framework', items: [{ href: '/admin/framework/modules', label: 'Modules', icon: <lucide> }] })`, client-safe); fill `lib/app/admin-nav.ts` to call it then `initLeafAdminNav()`; new empty `lib/app/leaf-admin-nav.ts`.
- **Framework endpoint constants** — `lib/framework/admin/endpoints.ts` (framework-owned; do not touch core `lib/api/endpoints.ts`), starting with the module paths t-1–t-5 consume.
- **Module list page** — `app/admin/framework/modules/page.tsx` (thin server component: `serverFetch(GET /modules)` → `initialModules`, empty state on failure, `Metadata`) + a `'use client'` `<ModulesTable>` (`components/ui/table`: slug, name, status, registered?, audience, updated; row → `/admin/framework/modules/[slug]`). No N+1 (the list endpoint is already enriched); no SWR.
- **Done when:** the "Framework → Modules" section renders in the admin sidebar; the list page renders registered modules from the live API with a graceful empty state; nav-seam unit test + page component test green; boundary CI green on the new `lib/framework/*` + `app/admin/framework/*` paths (first files under that glob); **gates green — `/pre-pr` → `/security-review` → `/code-review`, all before opening the PR** (retro B4, [[gates-before-opening-pr]]).

### t-2 · Module detail shell (tabbed) + Config tab + Versions tab

The module detail page and its two read-side tabs — **pure UI over 06's shipped API**; ships the tab-array host.

- **Detail shell** — `app/admin/framework/modules/[slug]/page.tsx` (thin server: fetch the module + `GET /config` → `initial*`) + a `'use client'` tabbed detail component modelled on `agent-form.tsx`'s multi-tab layout (`components/ui/tabs`). The tab set is a **declared array** so t-3/t-4/08 append entries. Ships tabs: **Config**, **Versions** (Settings/Agents/Workflows/Knowledge added by later tasks).
- **Config tab** — the **client renderer** over 06's engine: map each `FieldDescriptor` (`string`/`number`/`boolean`/`enum`/`json`) to an input via raw `useForm` + `zodResolver` (house style — no shadcn `<Form>`), each with a `<FieldHelp>` from the descriptor's `label`/description; the `json` fallback is a validated raw-JSON textarea; submit → `apiClient.put(PUT /config, { config, changeSummary? })`; surface the server's A4 validation errors (the server re-parses — the client form is convenience, never the trust boundary).
- **Versions tab** — `apiClient.get(GET /versions)` → a list (version, author, changeSummary, createdAt; newest = live), each prior version with a **Restore** action → `apiClient.post(…/[version]/restore)` (confirm dialog; success re-fetches, since restore snapshots forward).
- **Done when:** the detail page renders the tabbed shell with a working Config form (all descriptor types + JSON fallback) that saves and shows validation errors, and a Versions tab that lists + restores; component tests (mocked `apiClient`) green; **gates green** before opening the PR.

### t-3 · Module lifecycle writes — `PATCH` + `DELETE /modules/[slug]`

The one task that **builds module write endpoints** — isolated for focused (security-sensitive) review.

- **Write service** — add `updateModule` / `deleteModule` to `lib/framework/modules/` (new `service.ts` beside `queries.ts`): `updateModule(slug, patch)` writes only the universal operator controls (status, audience, `featureFlagName`, `availableFrom`/`availableUntil`, display name) after Zod validation; `deleteModule(slug)` hard-deletes the `Module` row **and calls `invalidateAllAgentAccess()`** (§decision 3 — the cascade runs no app code). Audit both via `logAdminAction`. **Retire ≠ delete:** retiring is a `status`/`isRegistered` change through `updateModule` — it **retains knowledge and does not invalidate** (the retain-on-retire decision [[f-module-bindings]] recorded); only hard-`DELETE` invalidates.
- **Routes** — `app/api/v1/admin/framework/modules/[slug]/route.ts` adding `PATCH` (validate body via a new `api-schemas.ts`, reuse `parseSlugParam` + `mapPrismaWriteError`) and `DELETE`. `withAdminAuth`; `/api/v1/**` rate-limit is automatic via `proxy.ts`.
- **Settings tab** — a **Settings** tab entry on t-2's shell: a form for the universal controls (→ `PATCH`) + a **danger zone** delete (typed-confirm → `DELETE`, then route back to the list).
- **Done when:** an operator can edit a module's lifecycle fields and hard-delete a module; `DELETE` provably calls `invalidateAllAgentAccess()` (asserted in the route test); retire retains knowledge (no invalidation); mocked-prisma route tests (admin-guard, validation, field-allowlist, invalidation) + Settings-tab component test green; **gates green** before opening the PR.

### t-4 · Binding management tabs — Agents / Workflows / Knowledge

**Pure UI over 07's shipped binding APIs** — the binding views deferred from [[f-module-bindings]] (reconciliation #1).

- Three tab entries on t-2's shell:
  - **Agents** — list `GET …/agents` (stitch the bound `agent{ name, deletedAt }`; flag a **tombstoned** agent whose row was soft-deleted); add a seat (role from `ModuleDefinition.agentRoles`, `isPrimary`), edit (`PATCH …/agents/[id]`), remove (`DELETE`).
  - **Workflows** — list `GET …/workflows` (stitch `workflow{ name, hasPublishedVersion }`; flag "**won't fire yet**" when no published version); add/edit/remove event→workflow bindings.
  - **Knowledge** — list `GET …/knowledge` → `{ documents, tags }`; grant a document **XOR** a tag (`POST`), revoke (`DELETE ?documentId | ?tagId`).
- All mutations via `apiClient`; re-fetch on success; the server invalidation wiring already shipped in 07 (bind/unbind invalidates), so these are plain UI.
- **Done when:** each tab lists its bindings with the tombstone / won't-fire flags and supports add/edit/remove over 07's endpoints; component tests (mocked `apiClient`, incl. the flag states) green; **gates green** before opening the PR.

### t-5 · Journey explorer — read endpoints + read-only canvas + individual replay

**Builds the journey read endpoints** (none exist) + the structural explorer. No collective overlays (those are 08).

- **Read endpoints** — `app/api/v1/admin/framework/journeys/**` over 09's `canRead`-guarded queries: a **list** (enumerate journeys for the picker — confirm at build whether it composes existing queries or needs a small `listJourneys`), a **map/state** read (`getJourney` + `getNodeStates` for a chosen journey), and a **timeline** read (`getJourneyTimeline` for replay). Construct the viewer `{ userId, isAdminSupport: true }` from the admin session **explicitly** (not `role === 'ADMIN'`); `withAdminAuth`; the queries gate-before-Prisma so cross-user reads are admin-support-only until #366/#367 land.
- **Explorer UI** — `app/admin/framework/journeys/page.tsx` (picker → detail) + a read-only `@xyflow/react` canvas (reuse `workflow-builder/` primitives — `ReactFlow` + `Background`/`Controls`/`MiniMap`, node/edge types — in read-only mode, drop drag/connect handlers) fed by a new **journey-graph mapper** (analogous to `workflow-mappers.ts`) that colours nodes by the user's `UserNodeState` status (visited/current/locked) from the published map.
- **Individual replay** — step the `getJourneyTimeline` event log along the map (a scrubber over `enter`/`complete` events, already written by `f-engine`); subject-scope-ready (the same `canRead`/`scope` seam, so owner/cohort scoping is additive later).
- **Explicit non-goal:** collective heat / drop-off overlays — deferred to `f-engagement` (08), which mounts them onto the canvas overlay prop this task leaves open.
- **Done when:** an operator can pick a user's journey, see it laid out on a read-only map coloured by node state, and replay their traversal from the event log; new journey route tests (admin-support viewer construction, `canRead` gating, 404/403) + explorer component tests (mocked queries) green; **gates green** before opening the PR.

## Alternative shapes considered

- **4 tasks, split-at-build** (bundle config+versions+lifecycle into one big t-2, bindings+DELETE into one big t-3). Rejected in favour of the 5-task clean-seam split: it would bury the security-sensitive `DELETE`+invalidation inside a binding-UI PR and mix UI-over-shipped-API with new-endpoint work in one review. The 5-task split keeps each PR one kind and isolates the trust-boundary work. (User decision, 2026-07-06.)
- **Build the config-form component in f-module-config (06).** Rejected there (06's "Alternative shapes") — the client renderer is page work over 06's engine, and it belongs on the module detail page 15 owns. It lands here as t-2.
- **Add framework paths to core `lib/api/endpoints.ts`.** Rejected — that's a Sunrise-owned file; a framework-owned constants module keeps the edit in-tier and merge-clean (reconciliation #5).
- **Include collective analytics now.** Rejected — §decision 1 (the 08 question). They're 08's vertical; 15 leaves the extension points.

## Open questions

- **Journey list endpoint** — does enumerating journeys for the explorer picker compose existing `canRead`-guarded queries, or need a small `listJourneys(viewer, scope)` added to the framework journey query module? Resolve at t-5 build (lean: a thin admin-support-scoped list query, subject-scope-ready).
- **Module delete vs retire in the UI** — t-3 exposes both hard-delete (danger zone, invalidates) and retire-via-status (retains knowledge). Confirm the operator affordance makes the distinction obvious (a fork's operator shouldn't hard-delete when they meant to retire).
- **Nav icon + section placement** — pick a `lucide-react` icon for the Framework section and confirm its sidebar position relative to core sections (dedupe is by `title`; use a distinct one). Cosmetic, settled at t-1.

## Done when (feature)

An operator can, from the admin sidebar's **Framework** section: browse registered modules; open a module and edit its operator config against the module's own schema (with version history + restore); manage its agent/workflow/knowledge bindings; change its lifecycle (edit universal controls; retire retaining knowledge; hard-delete with agent-access-cache invalidation); and explore an individual user's journey on a read-only map with event-log replay. All UI is over framework-tier APIs — the two new endpoint pairs (module lifecycle writes; journey reads) built here, the rest consuming 03/06/07's shipped surfaces. **08's analytics surfaces (module stats; collective heat/drop-off) are deliberately out of scope** and mount additively onto this feature's host surfaces later (host-first). Expected pure framework-tier — confirm per B17 at each task; ledger any upstream ask that surfaces.

## References

- [[plan#15 · `f-ops-views` — module admin + journey explorer|plan.md feature 15]] — parent.
- [[framework-architecture#4. Modules|spec §4.4]] (module admin) + [[framework-architecture#5. Facilitation Structures|§5.6]] (journey views) + Appendix A (A4, A6), X2.
- [[f-module-core]] — the module row + read API t-1 consumes; the read-API-here / page-there precedent.
- [[f-module-config]] — the config walker + `FieldDescriptor[]` + version API t-2 renders; the 06 side of the deferred form.
- [[f-module-bindings]] — the binding APIs t-4 consumes; the recorded hard-delete invalidation gap + retain-on-retire decision t-3 honours.
- [[f-journey-state]] — `canRead` / `subjectScope` + the journey queries t-5 builds endpoints over.
- [[f-bootstrap]] — the boot-seam (`initApp` → `initFramework` → `initLeafApp`) the nav seam mirrors.
- [[building-a-feature]] — the execution rhythm every task follows.
- [[planning-retro]] — fold feature-plan-authoring lessons here as they surface (§B).

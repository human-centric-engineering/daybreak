---
name: f-admin-surfaces
feature: 22 · f-admin-surfaces
epic: Framework v1.1
status: in flight
owner: John
depends_on: f-slots (shipped — #19 · #22 · #24) · f-slot-capture (shipped — #42–#46) · f-policies (shipped — #73 · #74 · #75 · #78) · f-emergence (shipped — #78 · #80 · #82) · f-ops-views (shipped — #66–#97)
spec: framework-architecture.md §4.4 (module/slot admin) · §5.5 (governance — policies, emergence) · §6 (data-slots) · Appendix A — A4 (generic form) · F14 (governance) · F17 (proposal pipeline)
parent: plan.md
opened: 2026-07-09
---

# f-admin-surfaces — the orphaned admin UIs + ops-views UX polish

> Feature-level build plan for **`f-admin-surfaces`** (#22), the v1.1 follow-on that fills
> the admin UIs deferred _into_ `f-ops-views` (15) that it shipped without (module admin +
> journeys only), plus the ops-views UX polish its own build surfaced.
> Parent: [[plan#22 · `f-admin-surfaces` — the orphaned admin UIs + ops-views UX polish|plan.md feature 22]].
> Binding _how_: [[framework-architecture#4. Modules|§4.4]] · [[framework-architecture#5. Facilitation Structures|§5.5]] · [[framework-architecture#6. Data-Slots|§6]] · Appendix A (A4, F14, F17).
> Sizing follows the parent plan: **task = one PR** (~200–600 lines, cohesive, reviewable); commits sit below this resolution.

## Intent

Four shipped features built their read/write APIs **API-first and deferred their admin UI to `f-ops-views` (15)** — the standing framework split (read API in the owning feature, page in the ops surface). But 15 shipped a **narrower** scope than the deferrals assumed: it delivered module admin + the journey explorer only, and every "→ f-ops-views" handoff for **slots, policies, and proposals** was left behind ([[planning-retro#B28|the B28 "deferred to the ops surface, which then narrowed" pattern]], one level up). This feature is where an operator first _sees and drives_ those three surfaces, plus the UX polish 15's own binding-tab build deferred:

- **`f-slots` (05)** + **`f-slot-capture` (10)** shipped the `SlotDefinition`/`SlotValue` models, the capture capabilities, and a bare `GET /slot-definitions` list API — and deferred the **slot admin UI** (definitions browser + a values read surface) explicitly to 15 ([[f-slot-capture]] out-of-scope: _"Slot admin UI → f-ops-views (15)"_).
- **`f-policies` (17)** shipped the full `FacilitationPolicy` CRUD API (the discriminated-union of 4 kinds) and deferred the **policy admin UI** to 15 ([[f-policies]] out-of-scope: _"The policy admin UI → f-ops-views (15)"_).
- **`f-emergence` (18)** shipped the `StructureChangeProposal` list/read/approve/reject API (t-3 #82) and deferred the **proposal review queue UI** (out-of-scope).
- **`f-ops-views` (15)** itself deferred two binding-tab niceties its `/code-review` surfaced: **searchable roster pickers** (`?q=` typeahead — the `ROSTER_LIMIT=100` no-search cap) and **per-binding `config`-override editing** (the agents-tab `config` field the model carries but the UI never edited).

**This is almost entirely net-new pages under `app/admin/framework/` + nav items** — the backend and lib layers already ship for all four surfaces (verified below). It is the 03/06/07 "UI over shipped API" move, one more level up.

## Reconciliation with current repo reality (verified 2026-07-09)

Reconciled against the tree, not the board sketch ([[planning-retro#B2]]). The recon confirmed the backend is essentially complete; the gaps are UI plus **two small backend-adjacent items**.

### 1. Slot admin — list API ships, values endpoint does NOT

- **Models EXIST** — `prisma/schema/framework-data-slots.prisma`: `SlotDefinition` (L23; `slug`, `group`, `scope`, `visibility`, `mode`, `dataType`, `sensitivity`, `priorityWeight`, `isActive`), `SlotValue` (L59; insert-only versioned, `userId` plain FK, `confidence`, `sourceType`, `provenance`, `supersededAt`).
- **Lib EXISTS** — `lib/framework/data-slots/queries.ts`: `listSlotDefinitions()` (L20), `getSlotDefinition(slug)` (L30); `values.ts`: `getSlotHeads(...)` (L137; current non-superseded heads), `appendSlotValue(...)` (L82). Masking machinery exists at `data-slots/capabilities/masking.ts`.
- **`GET /api/v1/admin/framework/slot-definitions` EXISTS** (`route.ts` L31, `withAdminAuth`) → raw `listSlotDefinitions()` rows (incl. inactive). The route comment names the list _page_ as f-ops-views' deferral.
- **DOES NOT EXIST:** any slot-**values** read endpoint (no route over `getSlotHeads`), a read-by-slug definition endpoint, and **any `app/admin/framework/slots/` page**. → **t-1 builds the one new endpoint (values read, PII-sensitive) + both browser surfaces.**

### 2. Policy admin — full CRUD API ships, UI does NOT

- **Model + kinds EXIST** — `FacilitationPolicy` (`framework-facilitation.prisma` L181; `kind` CHECK-constrained discriminator, `enabled`, `payload` JSON, `createdBy`). `lib/framework/facilitation/policies/kinds.ts`: `FACILITATION_POLICY_KINDS = ['auto_approval','relevance_gating','guard_minimum','escalation']` (L25), a per-kind payload schema each (L40/L65/L95/L133), `facilitationPolicySchema = z.discriminatedUnion('kind', …)` (L163), `assertValidFacilitationPolicy(kind, payload)` (L177).
- **Full CRUD API EXISTS** — `…/facilitation/policies/route.ts` `GET` (L25, list) + `POST` (L35, create); `…/policies/[policyId]/route.ts` `PATCH` (L27) + `DELETE` (L46). All `withAdminAuth`. Body schemas in `policies/api-schemas.ts`.
- **DOES NOT EXIST:** any policy page. → **t-2 is pure UI over the shipped CRUD API** (no new endpoint); the meat is a **per-kind payload form** over the 4-member union.

### 3. Proposal / emergence review — list/approve/reject API ships, UI does NOT

- **Model + lib EXIST** — `StructureChangeProposal` (`framework-facilitation.prisma` L204; `subjectType` 'map', `proposedDefinition` JSON, `status` pending|approved|rejected|published, `riskClass`, `createdBy` "agent:<slug>"|userId, `reviewedBy`, `publishedVersionId`). `emergence/proposal-service.ts`: `listStructureChangeProposals(filter)` (L91), `getStructureChangeProposal(id)` (L78); `approval.ts`: `approveProposal(...)` (L53, validate→publish), `rejectProposal(...)` (L132).
- **API EXISTS** — `…/facilitation/proposals/route.ts` `GET` (list, L32) + `POST` (submit, L46); `…/[proposalId]/route.ts` `GET`; `…/[proposalId]/approve/route.ts` `POST`; `…/[proposalId]/reject/route.ts` `POST` (`rejectProposalBodySchema`). All `withAdminAuth`.
- **Core approvals UI is NOT reusable** — `app/admin/orchestration/approvals/` is scoped to **paused workflow executions**, touches nothing framework; it's a _pattern to mirror_, not a component to import.
- **DOES NOT EXIST:** any proposals page. → **t-3 is pure UI over the shipped list/approve/reject API.**

### 4. Ops-views UX polish — backend ready, UI wiring missing

- **Roster endpoints already support `?q=`** — agents/workflows/knowledge-documents/knowledge-tags list routes each parse + apply a case-insensitive `q` filter (verified in all four handlers + their Zod query schemas). **Gap:** `components/admin/framework/module-detail/use-binding-roster.ts` (`ROSTER_LIMIT=100`, L22) fetches **once** with no `q` and a fetch-once guard (L48); the three binding tabs hardcode roster URLs without `q`. → **t-4 threads typeahead through `useBindingRoster` + the three tabs** (UI-only; server ready).
- **Per-binding `config` override NOT edited** — `agents-tab.tsx` L14–15 documents the deferral (_"a per-binding `config` override exists on the model but has no operator-facing consumer yet"_). → **t-4 adds a `config` (JSON) editor to the agents tab.**

### 5. Nav + route structure — the open slots

- `lib/framework/admin-nav.ts` registers one flat **"Framework"** section with 4 items: Modules, Maps, Journeys, Atlas. New items append to this array (client-safe: registrar + `lucide-react` icons only).
- Pages exist for `modules/`, `maps/`, `journeys/`, `atlas/`. **No `slots/`, `policies/`, `proposals/`** — the three open page slots. Page URLs stay **flat under `framework/`** (`/admin/framework/{slots,policies,proposals}`) for consistency with `maps`/`journeys`/`atlas`, even though the policy/proposal **APIs** nest under `…/facilitation/…`.
- **No framework endpoint-constants module** (`lib/framework/admin/endpoints.ts` does not exist) — the shipped pages use literal `/api/v1/admin/framework/…` paths. Follow suit (literals), consistent with the tree.

## The shape decisions (read this first)

Settled; reasoning recorded so a reviewer or resumed session doesn't relitigate.

### A. Scope — three orphaned surfaces + one polish task, all independent

The four board tasks map 1:1 to the four deferrals above. They touch **disjoint** surfaces (slots · policies · proposals · the shipped binding tabs), share no new schema, and have **no dependency edges between them** — so after the claim PR they proceed in **any order / in parallel**, exactly like f-ops-views' t-4a/b/c and t-5. There is no "first task stands up the section" barrier: the Framework nav section + `app/admin/framework/` route tree already exist (f-ops-views), so each task just appends its own nav item + page subtree.

### B. Slot values are PII — the one trust-boundary task

`SlotValue` is per-user captured personal data carrying a `sensitivity` grade, with masking machinery already built for the capture path (`data-slots/capabilities/masking.ts`). An admin values browser reading **across users** is admin-support territory (the same posture as f-ops-views' journey explorer, which built `{ isAdminSupport: true }` viewers explicitly rather than `role === 'ADMIN'`). So the **new slot-values endpoint (t-1) is the security-sensitive slice** and gets focused review: `withAdminAuth`, reuse `getSlotHeads`, and **respect `sensitivity`** — high-sensitivity heads are **masked by default** through the existing masking helper with an explicit per-row reveal, never bulk-dumped. This mirrors f-ops-views isolating its `DELETE`+invalidation in t-3. (If it grows, t-1 may split at build into t-1a _definitions browser_ [UI-over-shipped-API] and t-1b _values endpoint + browser_ [new-endpoint + PII] — the same UI-over-API vs new-endpoint seam that split f-ops-views t-5.)

### C. Policy form — generic union, not four bespoke forms

The policy admin is a **CRUD table + a create/edit form driven by the discriminated union**: pick a `kind`, render that kind's payload fields. The **honest reuse question** is A4's `describeConfigSchema` walker (f-module-config's Zod→`FieldDescriptor[]` engine that the module Config tab renders). **Decision:** _try_ the walker against the four payload schemas at build; if a kind's payload is flat-enough it reuses the Config-tab renderer verbatim (maximal reuse), and only genuinely-nested payloads get a hand-built sub-form. Confirm per-kind at build ([[planning-retro#B17]]) — do **not** pre-commit to four hand-forms. The kind list + schemas come from `kinds.ts`; the client never re-validates as the trust boundary (the server `assertValidFacilitationPolicy` does).

### D. Proposal review shows a structured summary, not a visual map-diff

A `StructureChangeProposal.proposedDefinition` is a full map definition against a `baseVersion`. A **visual before/after map-diff on the `@xyflow` canvas is deliberately out of scope** for v1.1 — it's a heavy, separable surface. t-3 shows the proposal **metadata** (subject, author `agent:<slug>` vs user, `riskClass`, `baseVersion`, status) + a **structured/JSON view** of the proposed change, with approve (→ validate+publish) and reject (reason-required) actions. The visual diff is recorded as a follow-up. This keeps t-3 a clean review-queue PR patterned on core `ApprovalsTabs` (mirrored, not imported).

## Which endpoints this feature builds vs consumes

**Consumes (all shipped, `withAdminAuth`, framework-tier):**

| Endpoint                                                                               | Shipped in           | Surface                                    |
| -------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------ |
| `GET /slot-definitions`                                                                | f-slots (#24)        | t-1 definitions browser                    |
| `GET/POST /facilitation/policies` · `PATCH/DELETE …/policies/[policyId]`               | f-policies (#73–#78) | t-2 policy CRUD UI                         |
| `GET/POST /facilitation/proposals` · `GET/…/[id]` · `POST …/approve` · `POST …/reject` | f-emergence (#82)    | t-3 review queue                           |
| `GET …/orchestration/{agents,workflows,knowledge/documents,knowledge/tags}?q=`         | core / earlier       | t-4 typeahead (server already `q`-capable) |

**Builds (new — the one endpoint this feature owns):**

- **`GET /api/v1/admin/framework/slot-values`** (t-1) — over `getSlotHeads`, `withAdminAuth`, sensitivity-masked by default (decision B). Query params: filter by `slotSlug` and/or `userId`, paginated. No values read endpoint exists today. This is the isolated trust-boundary slice.

Everything else is **pages + one nav item each** over already-shipped APIs.

## Framework-tier assessment — expected pure, confirm at build (B17)

Every piece lives in the **framework tier**: pages under `app/admin/framework/{slots,policies,proposals}/`, components under framework-owned `components/admin/framework/*` segments, the one new endpoint under `app/api/v1/admin/framework/slot-values/` reading `lib/framework/data-slots/`, and nav items in `lib/framework/admin-nav.ts`. **No new migration** (t-1 reads existing slot tables; t-2/t-3 are pure UI; t-4 touches only shipped components). The new endpoint consumes core only in the allowed direction (`withAdminAuth`, the masking helper, `logAdminAction` if any admin read-audit is warranted). So the expectation is **pure framework-tier, no upstream Sunrise issue** — but per [[planning-retro#B17]] confirm at each task and ledger any core seam that surfaces.

## Test strategy (house style)

Vitest on `happy-dom`, **no live DB** ([[f-module-core]] reconciliation note): mock `@/lib/db/client`, forward `executeTransaction` to a `tx` mock; real-DB fidelity via `smoke:*`, never vitest-against-dev-DB ([[planning-retro#B9]]). Component tests use `@testing-library/react` + `user-event` + `jest-dom` (pattern at `tests/integration/app/admin/**/page.test.tsx`, e.g. f-ops-views' module/journey pages). Concretely:

- **Pages/components** (all tasks) — render with mocked `apiClient`/`serverFetch` (happy-dom has no network): slot-definitions table renders rows + empty state on failure; slot-values browser renders masked heads + reveal; the policy form renders the right fields per selected `kind` and `POST/PATCH`s the payload; proposals list + approve/reject actions fire with confirm + reason; the binding-tab typeahead debounces and threads `?q=`; the agents-tab `config` editor validates + saves.
- **New endpoint** (t-1) — the established **mocked-prisma + `withAdminAuth`** contract test: admin-guard (401/403, DB untouched), Zod query validation, **asserts high-sensitivity heads are masked** in the response (the security-relevant behaviour), pagination envelope.
- **UX polish** (t-4) — the three binding tabs' existing tests stay green (behaviour preserved) with the typeahead added; a new test asserts `?q=` reaches the roster URL and the fetch-once guard is relaxed to allow a re-query.

## Tasks (promoted)

| ID  | Task                                                                                                                                                      | Files (indicative)                                                                                                                                                                                                                                                        | Deps | Status          | PR   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------- | ---- |
| t-1 | **Slot admin** — definitions browser + **new** sensitivity-masked slot-values read endpoint + values browser + "Slots" nav item                           | `app/api/v1/admin/framework/slot-values/route.ts` (new), `lib/framework/data-slots/{admin-queries,api-schemas,view}.ts` (new), `app/admin/framework/slots/{page,[slug]/page}.tsx`, `components/admin/framework/slots/*`, `lib/framework/admin-nav.ts` (+Slots), `tests/…` | —    | **done**        | #124 |
| t-2 | **Policy admin** — `FacilitationPolicy` CRUD UI (table + per-kind union form) over the shipped API + "Policies" nav item                                  | `app/admin/framework/policies/{page}.tsx`, `components/admin/framework/policies/*` (table, kind-form), `lib/framework/admin-nav.ts` (+Policies), `tests/…`                                                                                                                | —    | **done**        | #125 |
| t-3 | **Proposal / emergence review** — review queue (list + detail + approve/reject) over the shipped API + "Proposals" nav item                               | `app/admin/framework/proposals/{page,[proposalId]/page}.tsx`, `components/admin/framework/proposals/*`, `lib/framework/admin-nav.ts` (+Proposals), `tests/…`                                                                                                              | —    | **in flight**   | —    |
| t-4 | **Ops-views UX polish** — searchable `?q=` roster pickers (typeahead) across the 3 binding tabs + per-binding `config`-override editing on the agents tab | `components/admin/framework/module-detail/{use-binding-roster,agents-tab,workflows-tab,knowledge-tab}.tsx`, `tests/…`                                                                                                                                                     | —    | **available** ▲ | —    |

**Four promoted PRs, mutually independent** (disjoint surfaces, no shared schema — decision A) → any order / parallel after the claim PR. The split is drawn on the same **UI-over-shipped-API vs builds-one-new-endpoint** seam f-ops-views used: t-2/t-3/t-4 build **no** endpoints; t-1 builds the **one** new (PII-sensitive) endpoint and is the isolated trust-boundary review (decision B). t-1 may split at build into t-1a/t-1b if it exceeds one cohesive PR ([[planning-retro#B1]]).

### t-1 · Slot admin — definitions browser + values read endpoint + values browser

The one task that **builds a new endpoint** — isolated for focused (PII-sensitive) review.

- **New read endpoint** `GET /api/v1/admin/framework/slot-values` — over `getSlotHeads` (`lib/framework/data-slots/values.ts`), `withAdminAuth`, `?slotSlug=&userId=&limit=&cursor=` (Zod query schema in a new `data-slots/api-schemas.ts`), `paginatedResponse`. **Sensitivity masking (decision B):** high-sensitivity heads are masked through the existing masking helper by default; the response carries a per-row `masked` flag; reveal is an explicit per-row affordance (a second call with an explicit `reveal` param, audited). A thin `admin-queries.ts` composes `getSlotHeads` + the definition join (for `sensitivity`/`dataType`) so `queries.ts`/`values.ts` stay the pure primitives; wire types (string dates) in a new `view.ts`.
- **Definitions browser** — `app/admin/framework/slots/page.tsx` (thin server: `serverFetch(GET /slot-definitions)` → `initial*`, empty state on failure) + a `'use client'` `<SlotDefinitionsTable>` (slug, group, scope, dataType, sensitivity, mode, active). Row → `/admin/framework/slots/[slug]` detail: the definition's fields + its **captured values** (the values browser below, filtered to that slot).
- **Values browser** — a `'use client'` component over `GET /slot-values`, rendering masked heads (user, version, confidence, sourceType, capturedAt) with the per-row reveal for high-sensitivity rows.
- **Nav** — add a "Slots" item (`/admin/framework/slots`, a `lucide` icon) to `lib/framework/admin-nav.ts`.
- **Done when:** an operator can browse slot definitions, open one, and see its captured values with sensitive values masked-by-default + explicit reveal; the new endpoint's contract test asserts admin-guard + masking; component tests green; boundary CI green; **gates green — `/pre-pr` → `/security-review` → `/code-review`, all before opening the PR** ([[planning-retro#B4]]).

### t-2 · Policy admin — FacilitationPolicy CRUD UI

Pure UI over the shipped full-CRUD API — no new endpoint.

- **List** — `app/admin/framework/policies/page.tsx` (thin server: `serverFetch(GET /facilitation/policies)`) + a `'use client'` table (kind, enabled, createdBy, updatedAt) with an enable/disable toggle (`PATCH`) and delete (confirm → `DELETE`).
- **Create / edit form (decision C)** — a `kind` selector (`FACILITATION_POLICY_KINDS`) that renders the selected kind's payload fields. **Try `describeConfigSchema` (f-module-config's A4 walker) against each payload schema first**; reuse the Config-tab `FieldDescriptor` renderer where the payload is flat, hand-build a sub-form only for genuinely-nested kinds. Submit → `apiClient.post/patch`; surface the server's Zod errors (the server `assertValidFacilitationPolicy` is the trust boundary, the client form is convenience). Each field gets a `<FieldHelp>`.
- **Nav** — add a "Policies" item to `lib/framework/admin-nav.ts`.
- **Done when:** an operator can list, create, edit, enable/disable, and delete policies of all four kinds, with per-kind payload validation surfaced from the server; component tests (mocked `apiClient`, one per kind's field set) green; **gates green** before opening the PR.

### t-3 · Proposal / emergence review queue

Pure UI over the shipped list/approve/reject API — no new endpoint. Patterned on core `ApprovalsTabs` (mirrored, not imported).

- **List** — `app/admin/framework/proposals/page.tsx` (thin server: `serverFetch(GET /facilitation/proposals)`) + a `'use client'` table (subject, author `agent:<slug>`|user via `parseAuthor`, riskClass, status, createdAt), status-filter tabs (pending / approved / rejected / published) mirroring `ApprovalsTabs`.
- **Detail (decision D)** — `[proposalId]/page.tsx`: proposal metadata + a **structured/JSON view** of `proposedDefinition` against `baseVersion` (no visual map-diff in v1.1). **Approve** → `POST …/approve` (confirm; runs validate+publish server-side; success re-fetches). **Reject** → `POST …/reject` with a required reason (`rejectProposalBodySchema`).
- **Nav** — add a "Proposals" item to `lib/framework/admin-nav.ts`.
- **Done when:** an operator can review pending proposals, read the proposed change, and approve (→ publish) or reject (with reason); the queue reflects status transitions; component tests (mocked `apiClient`; approve/reject fire correctly; reject requires a reason) green; **gates green** before opening the PR.

### t-4 · Ops-views UX polish — searchable rosters + per-binding config editing

Touches **shipped f-ops-views components** → coordinate (it's the "refactors shipped readers" caveat). No new endpoint (the roster endpoints already accept `q`).

- **Searchable roster typeahead** — change `useBindingRoster` (`components/admin/framework/module-detail/use-binding-roster.ts`) to accept a `q` and **relax the fetch-once guard** to allow a debounced re-query (thread `?q=` into the roster URL; keep the `capped`/`ROSTER_LIMIT` flag as the "narrow your search" hint). Wire the three binding tabs (`agents-tab`, `workflows-tab`, `knowledge-tab`) to a search input driving `q`. Resolves the [[f-ops-views]] "searchable roster pickers" follow-up (worst for Knowledge, whose corpora routinely exceed 100).
- **Per-binding `config` editing** — add a validated raw-JSON `config` editor to the agents tab's binding row/edit affordance (`PATCH …/agents/[id] { config }`), removing the L14–15 deferral. JSON is validated client-side for convenience; the server remains the trust boundary.
- **Done when:** binding pickers are typeahead-searchable past the 100-cap and the agents tab can edit a binding's `config`; the three tabs' existing tests stay green (behaviour preserved) + new tests cover the `q` threading and the config editor; **gates green** before opening the PR.

## Alternative shapes considered

- **Fold slots/policies/proposals back into a reopened f-ops-views (15).** Rejected — 15 is **shipped**; reopening a shipped feature muddies the board. The v1.1 sweep deliberately grouped these deferrals into a claimable follow-on feature so they run the same claim-first → gate-loop ([[plan]] "Follow-on features").
- **One mega "governance" task (policies + proposals together).** Rejected — they're disjoint surfaces (a policy CRUD form vs a proposal review queue) with different machinery; bundling makes an oversized mixed-review PR. Kept as t-2 / t-3 (decision A), each ~one cohesive PR.
- **Visual before/after map-diff for proposals.** Rejected for v1.1 (decision D) — a heavy, separable `@xyflow` surface; recorded as a follow-up. t-3 ships the structured view.
- **Four bespoke policy forms.** Rejected as a default (decision C) — try the A4 walker first; hand-build only genuinely-nested kinds. Reuse over reinvention.

## Open questions

- **Governance nav grouping** — Slots/Policies/Proposals as three flat items in the single "Framework" section (7 items total), or a nested "Governance" sub-grouping? Lean flat (consistent with Maps/Journeys/Atlas); revisit only if the sidebar feels crowded. Cosmetic, settle at t-2/t-3.
- **Slot-values reveal audit** — should an explicit high-sensitivity reveal write a `logAdminAction` audit row? Lean **yes** (revealing PII is an operator action worth an audit trail). Confirm at t-1 build.
- **`describeConfigSchema` fit for policy payloads** — does the A4 walker cover all four payload schemas, or do some kinds (e.g. `escalation`'s nested condition) need a hand-form? Build-time finding per [[planning-retro#B17]] (decision C).

## Done when (feature)

An operator can, from the admin sidebar's **Framework** section: browse slot definitions and inspect a slot's captured values with sensitive data masked-by-default and an explicit reveal; list/create/edit/enable/delete facilitation policies of all four kinds against their own payload schemas; review, approve (→ publish), and reject structure-change proposals from the emergence pipeline; and — in the module binding tabs — search rosters past the 100-cap and edit a per-binding `config` override. All UI is over framework-tier APIs — the one new endpoint (sensitivity-masked slot-values read) built here, the rest consuming f-slots / f-policies / f-emergence / f-ops-views' shipped surfaces. **Deliberately out of scope:** the visual proposal map-diff (follow-up, decision D) and any collective analytics (that's `f-engagement-analytics` (21)). Expected pure framework-tier — confirm per [[planning-retro#B17]] at each task; ledger any upstream ask that surfaces.

## References

- [[plan#22 · `f-admin-surfaces` — the orphaned admin UIs + ops-views UX polish|plan.md feature 22]] — parent.
- [[f-ops-views]] — the ops surface that shipped narrower; the read-API-here / page-there precedent this feature completes, and the source of the t-4 polish follow-ups.
- [[f-slots]] / [[f-slot-capture]] — the slot models + `getSlotHeads` + the deferred slot admin UI (t-1).
- [[f-policies]] — the `FacilitationPolicy` CRUD API + kinds/payload schemas t-2 renders.
- [[f-emergence]] — the `StructureChangeProposal` list/approve/reject API t-3 drives.
- [[f-module-config]] — the A4 `describeConfigSchema` walker t-2 tries to reuse for policy payloads.
- [[building-a-feature]] — the execution rhythm every task follows.
- [[planning-retro]] — fold feature-plan-authoring lessons here as they surface (§B).

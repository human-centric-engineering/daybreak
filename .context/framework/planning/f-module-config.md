---
name: f-module-config
feature: 06 · f-module-config
epic: Framework v1
status: shipped (t-1 #56 · t-2 #58)
owner: Simon Holmes
depends_on: f-module-core (shipped — t-1 #10 · t-2 #11 · t-3 #12)
spec: framework-architecture.md §4.1 (Modules) + Appendix A (A4 Zod config · A10 ModuleVersion) + X1
parent: plan.md
opened: 2026-07-06
shipped: 2026-07-06 (unblocks f-ops-views 15)
---

# f-module-config — config validation + versioning

> Feature-level build plan for **`f-module-config`**, the operator-config half of the module spine.
> Parent: [[plan#06 · `f-module-config` — config form + versioning|plan.md]].
> Binding _how_: [[framework-architecture#4. Modules|§4.1]] + Appendix A (A4 Zod `configSchema`,
> generically rendered · A10 config versioned via a full `ModuleVersion` snapshot table) and X1
> (free-form strings). Sizing follows the parent plan: **task = one PR** (~200–600 lines, cohesive,
> reviewable); commits sit below this resolution.

## Intent

`f-module-core` shipped a module's row with a `config Json @default("{}")` column and a code-side
`configSchema: z.ZodTypeAny` on the `ModuleDefinition` — but **nothing validates an operator's config
edit, versions it, or exposes it for editing.** This feature closes that gap (spec §4.1, A4 + A10):

- **A4 — config validated against the module's own Zod schema.** An operator's config write is parsed
  with the _registered module's_ `configSchema` before it lands, so "new module, new parameters, zero
  bespoke validation." The same schema drives a **generic** admin form — the admin UI never needs to
  know a module's parameters in advance.
- **A10 — config is versioned via a full `ModuleVersion` snapshot table.** Every config save captures
  a point-in-time snapshot (the `AiAgentVersion` pattern the spec names), so "what changed, who
  changed it, and roll it back" are first-class — experts will edit module config, and rollback
  matters.

**What ships here, and what deliberately does not.** In scope: the `ModuleVersion` model + the
config-versioning **service** (validate → write `Module.config` → snapshot; restore), and the **API**
that exposes config editing + version history — including the **Zod→descriptor introspection** that
is the _engine_ of A4's generic form (§below). **Out of scope, deferred to `f-ops-views` (15):** the
**client** generic-config **form component** and the **version-history tab** — the same API-first
split `f-module-core` (read API in 03, module page in 15) and `f-module-bindings` (binding APIs in 07,
binding UI in 15) already made. This feature ships the _generic-form engine_ (schema → field
descriptors, served by the config API); f-ops-views mounts a client renderer over it.

## The pivotal shape decision — where the "generic form" splits (read this first)

A4's headline is "a generic admin form rendered from each module's Zod schema." The **architecture
forces where that work lives**, and it is not all here:

- **The module registry is server-only.** A `ModuleDefinition` (and its live `configSchema` Zod
  object) is code, imported at boot on the server. **A browser can never hold the live Zod object.**
  So a generic client form _cannot_ consume the schema directly — the server must **serialize the
  schema to field descriptors** the client renders. That serializer (a `ZodObject` → `FieldDescriptor[]`
  **walker**) is the reusable substance of A4, it is **server-side framework lib**, and it ships
  **here** (served by the config `GET`). Recon confirmed **no such walker exists anywhere in the repo**
  — the two existing `configSchema` fields (`outbound/types.ts`, the eval grader) are `.safeParse`-only,
  never rendered; the capability-form "visual builder" renders a _JSON_-schema of one fixed shape, not
  arbitrary Zod. It is greenfield.
- **The client descriptor-renderer is a page.** Turning descriptors into RHF fields + `<FieldHelp>` +
  submit is presentation over an API — the kind of work 03/07 deferred to **f-ops-views (15)**, which
  owns the module detail page the form lives on. It reuses the existing `zodResolver`/`FormError`/
  `<FieldHelp>` scaffolding (validation is free); nothing framework-specific.
- **The server is the validation source of truth** regardless. `PUT config` re-parses with the real
  `configSchema` (A4), so a client renderer is a convenience, never a trust boundary. Until f-ops-views
  ships the rendered form, the config API is fully usable (a raw-JSON editor, `curl`, or a test drives
  it) — the feature is _done_ and demonstrable without any page, exactly like 03's read API.

**Net:** f-module-config ships the **engine** (validation + versioning + schema→descriptors + APIs);
f-ops-views ships the **client form + version tab**. This is the recommended shape below. _(If we
instead wanted the client form built here, it would add a framework-tier `<ModuleConfigForm>` component
task — see "Alternative shapes considered".)_

## Reconciliation with current repo reality

Verified against the tree on 2026-07-06 (per [[planning-retro#B2]] — reconcile against code, not the
spec sketch):

1. **Versioning model = `AiAgentVersion` point-in-time, NOT the map/workflow draft-buffer.** The board's
   indicative wording says "draft/publish/rollback"; **A10 is precise — it names the `AiAgentVersion`
   pattern**, and the code confirms the distinction matters. `AiAgentVersion`
   (`orchestration-agents.prisma:187`) has **no** `draftDefinition` / `publishedVersionId` — the live
   config _is_ the parent row, each save snapshots a version, and "restore to vN makes the row exactly
   as it was at vN" (`lib/orchestration/agents/agent-versioning.ts:1-20`, and the
   `agents/[id]/versions/[versionId]/restore` route). Contrast `AiWorkflowVersion` /
   `FacilitationGraphVersion`, which carry a `draftDefinition` buffer + `publishedVersionId` pointer on
   the parent for a long-lived edit-then-publish flow. **Module config is a form an operator fills and
   saves — not a long-lived draft** — so the agent model is both what the spec names and the correct
   fit: `Module.config` is live, a `ModuleVersion` is a historical snapshot, and **restore** (not
   rollback) is the operation. No `draftConfig` / `publishedVersionId` columns are added to `Module`.
2. **`Module.config Json @default("{}")` already exists** (`framework-modules.prisma:37`) — this
   feature writes/validates it; it adds no config column, only the `ModuleVersion` relation.
3. **`ModuleDefinition.configSchema: z.ZodTypeAny` already exists** (`definition.ts:43`) — the registry
   is the source of the schema; the service reads the registered def by slug to validate + describe.
4. **`ModuleVersion` is reserved-absent** in `framework-modules.prisma` (the header comment names it as
   this feature's to add) — a fill-the-reserved-slot addition, like 07's binding pivots.
5. **Shared helpers exist** (rule-of-three, from t-3): `lib/framework/shared/route-params.ts`
   (`parseSlugParam`) and `prisma-errors.ts` (`mapPrismaWriteError`) — the routes/service reuse these,
   not core `lib/validations` (Sunrise-owned).
6. **Versioning precedent to mirror:** `lib/framework/facilitation/map/version-service.ts` (f-map) is a
   framework-tier adaptation of the core workflow version-service and already solves the fork-boundary
   problems (`framework_` `@@map`, `createdBy` as a bare string with no `User` relation,
   `logAdminAction` with an `ENTITY_TYPE` constant, `mapPrismaWriteError`). Copy its structure;
   retarget to the point-in-time model (no draft buffer, per reconciliation 1).

## Pure framework-tier — no upstream Sunrise issue

Like `f-module-core` and `f-map`, **`f-module-config` touches no Sunrise core seam.** Every piece —
the `ModuleVersion` model, the config-versioning service, the Zod→descriptor walker, the admin routes —
lives in the **framework tier** (`lib/framework/modules/config/`, `app/api/v1/admin/framework/…`) and
only _consumes_ core through the allowed framework→core direction (`logAdminAction`,
`executeTransaction`, `withAdminAuth`, `getClientIP`, `@/lib/api/*`, the module registry). The one FK
to a core table — `ModuleVersion.createdBy → User` — uses the established **hand-FK** pattern (a plain
scalar, no Prisma `@relation`, `ON DELETE SET NULL` hand-written in the migration, mirroring
`ModuleWorkflowBinding.createdBy` from t-3), so **no Sunrise model gains a reverse field** (X6). So this
feature **files no upstream issue** and carries no cross-repo follow-up.

## Test strategy (house style)

Vitest on `happy-dom`, **no live DB** ([[f-module-core]] reconciliation note): tests mock
`@/lib/db/client` and forward `executeTransaction` to a prisma `tx` mock; real-DB verification is via
`smoke:*`, never vitest-against-dev-DB (retro B9). Concretely:

- **Walker** (`schema-descriptors.ts`) — pure, so an exhaustive unit matrix: each supported Zod leaf
  (string/number/boolean/enum), `optional`/`default` unwrapping, `.description` → label, min/max
  extraction, and the unsupported-shape → `json` fallback (nested object, union, array, effects).
- **Version service** — mocked-prisma: validate-reject (bad config against schema), save writes
  `Module.config` + creates a monotonic `ModuleVersion`, initial-version seed on first write, restore
  re-validates the snapshot + writes config + snapshots again, unregistered-module reject, audit call
  shape.
- **Routes** — mocked prisma + auth: admin-guard (401/403, DB untouched), `PUT` 422 on schema-invalid
  body, `GET config` returns `{ descriptors, values }`, `GET versions` lists, `restore` drives the
  service. Contract test at the conventional API path (no `@/lib/framework` import); any e2e that
  imports framework fns lives at the boundary-exempt `tests/**/lib/framework/**` path.

## Tasks (promoted)

| ID  | Task                                                                                                                                         | Files                                                                                                                                                                                                          | Deps | Status   | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- | --- |
| t-1 | **`ModuleVersion` spine + config-versioning service** (validate against registry `configSchema` → write `config` → snapshot; restore; audit) | `prisma/schema/framework-modules.prisma`, `framework_…` migration, `lib/framework/modules/config/{version-service,index}.ts`, `lib/framework/index.ts` (barrel), `tests/…`                                     | —    | **done** | #56 |
| t-2 | **Zod→descriptor walker + config/version admin APIs** (the A4 engine + editing/history endpoints)                                            | `lib/framework/modules/config/schema-descriptors.ts`, `app/api/v1/admin/framework/modules/[slug]/config/route.ts`, `.../[slug]/versions/route.ts`, `.../[slug]/versions/[version]/restore/route.ts`, `tests/…` | t-1  | **done** | #58 |

**Two promoted PRs — fewer than the parent plan's indicative `~4`.** The two deferred UI tasks (the
generic client form; the version-history tab) move to **f-ops-views (15)** per the API-first
reconciliation above, and the walker folds into its consuming API rather than shipping as an inert
standalone (the [[planning-retro#B1 · Sizing self-check when promoting tasks|B1 sizing self-check]] — a
walker with nothing calling it is scaffolding; it ships with the config `GET` that serves it). If t-2
grows past ~600 lines in the build, split the walker (t-2a) from the routes (t-2b); flagged, not
pre-split.

### t-1 · `ModuleVersion` spine + config-versioning service

The versioned config backbone: a validated config write that snapshots history.

- **`prisma/schema/framework-modules.prisma`** — add `model ModuleVersion`, mirroring `AiAgentVersion`
  under the fork-boundary conventions:
  - `id`, `moduleId`, `version Int` (monotonic per module, from 1), `snapshot Json` (the full
    `Module.config` as of this version — point-in-time), `changeSummary String? @db.Text`,
    `createdBy String?` (**plain scalar hand-FK to `User` — no `@relation`**; `ON DELETE SET NULL`
    hand-written in the migration, retained-config-author policy, mirroring `ModuleWorkflowBinding.createdBy`),
    `createdAt`, `@@unique([moduleId, version])`, `@@index([moduleId])`, `@@map("framework_module_version")`.
  - `module Module @relation(fields: [moduleId], references: [id], onDelete: Cascade)` (both
    framework-owned). Add the `versions ModuleVersion[]` back-relation on `Module`.
  - **Migration** — `framework_…`-named, touching only `framework_*` tables; author with
    `--create-only` then **strip the B13 spurious DROPs** (every pre-existing hand-FK + the
    pgvector/tsvector/partial-unique objects — the migrate-dev footgun), keeping only the new
    `framework_module_version` DDL + the `createdBy → "user" ON DELETE SET NULL` hand-FK. Verify with
    psql + `npm run db:drift-check`.
- **`lib/framework/modules/config/version-service.ts`** — mirror the f-map version-service structure
  (its point-in-time cousin), `ENTITY_TYPE = 'module_config'`:
  - `saveModuleConfig({ slug, config, userId, changeSummary?, clientIp })` — resolve the **registered**
    `ModuleDefinition` by slug (reject with a clear error if the module is unregistered / code removed —
    there is no schema to validate against); `configSchema.safeParse(config)` → `ValidationError` on
    failure (A4); in one `$transaction`: `nextVersionNumber(tx, moduleId)`, create the `ModuleVersion`
    snapshot, update `Module.config`. `logAdminAction` after commit (`action: 'module_config.save'`,
    `changes: { config: { from: prevVersion|null, to: newVersion } }`).
    **Reconciled at t-1 code review (no lazy v1 seed — the first save is v1):** the plan originally
    called for lazily seeding an "Initial configuration" v1 of the pre-edit config on first save (the
    `AiAgentVersion` precedent). Review showed that rationale does **not** transfer to modules: an
    agent's create-time config is a real human-authored snapshot, but a module's pre-edit state is the
    **empty `{}` boot-sync default** — so seeding it fabricated an author (stamped the first _editor_ on
    config they never wrote) and, for a schema with required fields, produced a v1 that fails its own
    restore re-validation (a version presented as restorable that can never be restored). Dropped; the
    first save is simply v1, and `from` is `null` for it. Also wraps the version-create in
    `mapPrismaWriteError` so a concurrent-save `@@unique([moduleId, version])` collision (a
    double-submitted form) is a retryable `ValidationError`, not a raw P2002 → 500.
  - `restoreModuleVersion({ slug, version, userId, clientIp })` — load the target `ModuleVersion` via
    `@@unique([moduleId, version])`; **re-validate its `snapshot` against the current `configSchema`**
    (the schema may have changed since — reject if the old snapshot no longer parses); write
    `Module.config` from the snapshot + snapshot a **new** version (`changeSummary: "Restore to vN"`).
    Audit `module_config.restore` (+ `metadata: { restoredFromVersion }`). History is never rewound.
  - `listModuleVersions(slug)` / `getModuleVersion(slug, version)` — reads; batch-stitch the `createdBy`
    display name in the service if needed (no `include` across the hand-FK, X6).
  - `nextModuleVersionNumber(tx, moduleId)` — `max(version)+1` inside the write tx (the agent-versioning
    helper shape) so concurrent writers can't collide on the unique constraint.
- **`lib/framework/modules/config/index.ts`** — barrel for the public service surface.
- **Done when:** migration applies clean + passes drift-check; `saveModuleConfig` validates against the
  registered schema (rejects bad config, rejects unregistered modules), writes config + a monotonic
  snapshot in one tx, seeds an initial version; `restoreModuleVersion` re-validates + writes + snapshots;
  audit entries emit; mocked-prisma tests green; **gates green — `/pre-pr` then `/security-review` then
  `/code-review`, all before opening the PR** (retro B4, [[gates-before-opening-pr]]).

### t-2 · Zod→descriptor walker + config/version admin APIs

The A4 engine (schema → renderable descriptors) plus the editing/history HTTP surface over t-1.

- **`lib/framework/modules/config/schema-descriptors.ts`** — `describeConfigSchema(schema: z.ZodTypeAny):
FieldDescriptor[]`. Walk a top-level `ZodObject`'s `.shape`; per field, unwrap
  `ZodOptional`/`ZodDefault`/`ZodNullable`, then classify the inner type into a descriptor:
  - `ZodString` → `{ type: 'string', key, label, required, default?, minLength?, maxLength? }`
  - `ZodNumber` → `{ type: 'number', … min?, max?, int? }`
  - `ZodBoolean` → `{ type: 'boolean', … }`
  - `ZodEnum`/`ZodNativeEnum` → `{ type: 'enum', options: string[], … }`
  - **anything else** (nested `ZodObject`, `Zodunion`, `ZodArray`, `ZodEffects`, `$ref`-like) →
    `{ type: 'json' }` **fallback** (the capability-form / execution-input-dialog escape hatch — a raw
    JSON field), so the walker is _total_ and never throws on an exotic schema.
  - `label` from the field's `.description` if present, else a humanised key; `required` = not optional
    and no default; `default` read from `ZodDefault`. Pure, no I/O, exhaustively unit-tested. Bounded on
    purpose (flat config is the 99% case — a module needing deep config uses the JSON fallback).
  - **As built (t-2):** rather than reach into Zod's version-specific `_def` internals (fragile across
    Zod majors), the walker converts the schema with **Zod 4's native `z.toJSONSchema(schema, {
unrepresentable: 'any' })`** and walks the stable JSON-Schema shape — `unrepresentable: 'any'` keeps
    it total (an unmodellable type becomes `{}` → the `json` fallback rather than a throw). Two
    JSON-Schema quirks handled after code review: a defaulted field is listed in JSON-Schema `required`
    (so form-`required` = in `required` **and** no default), and a bare `z.number().int()` emits
    ±`MAX_SAFE_INTEGER` sentinel bounds (dropped; `exclusiveMinimum`/`exclusiveMaximum` from
    `.positive()`/`.gt()` are read instead). The `[version]` path param is bounded to Postgres `int4`
    (an over-range value is a clean 400, not a DB error → 500).
- **`app/api/v1/admin/framework/modules/[slug]/config/route.ts`** — `GET` returns
  `{ descriptors: describeConfigSchema(def.configSchema), values: module.config }` (the registered def +
  the live row); `PUT` validates the body shape (Zod), then calls `saveModuleConfig(...)` with
  `getClientIP(request)` + the admin user id. `withAdminAuth` (the `/api/v1/**` section rate-limit is
  applied by `proxy.ts`; a per-flow sub-cap isn't needed for a config save).
- **`app/api/v1/admin/framework/modules/[slug]/versions/route.ts`** — `GET` → `listModuleVersions(slug)`.
- **`app/api/v1/admin/framework/modules/[slug]/versions/[version]/restore/route.ts`** — `POST` →
  `restoreModuleVersion(...)`. Reuse `parseSlugParam` + a cuid/int param parse from `route-params.ts`;
  map write errors via `mapPrismaWriteError`.
- **Done when:** the walker produces correct descriptors across the type matrix + falls back on
  unsupported shapes without throwing; `GET config` serves descriptors + values; `PUT` validates +
  versions (422 on schema-invalid body); `versions` lists; `restore` drives the service; admin-guarded
  throughout; boundary CI green on the new framework admin paths; **gates green — `/pre-pr` then
  `/security-review` then `/code-review`, all before opening the PR** (retro B4).

## Alternative shapes considered

- **Build the client `<ModuleConfigForm>` here (not f-ops-views).** Would add a t-3 for a framework-tier
  descriptor-renderer component + a minimal admin config page. Rejected as the _default_ because it
  breaks the API-first line 03/07 set (UI → f-ops-views) and gives f-module-config a page with no home
  in the ops nav yet. The engine (walker + APIs) is the reusable substance and is server-side; the
  client renderer is genuinely f-ops-views page work. **Open for the owner/user to overturn** if we want
  a demonstrable rendered form inside this feature.
- **Draft-buffer versioning (map/workflow model).** Rejected per reconciliation 1 — A10 names the
  `AiAgentVersion` point-in-time pattern, and a draft buffer is ceremony a fill-and-save config form
  doesn't need.
- **Append-only JSON `configHistory` column** (the spec sketch's discarded option). Rejected by A10
  itself — a snapshot table makes "what/who/rollback" first-class; the sketch's `configHistory Json` was
  explicitly "replaced by a `ModuleVersion` relation at implementation time."

## Open questions

- **Config on an unregistered module.** `saveModuleConfig` rejects when the slug has no registered
  `ModuleDefinition` (no schema to validate against). Reads (`GET config`, `listVersions`) still work on
  a retired row so history stays visible. Confirm this is the desired operator behaviour when building
  t-1 (alternative: allow raw-JSON config edits on unregistered modules with no validation — rejected
  as unsafe by default).
- **Descriptor coverage vs the JSON fallback.** The walker handles flat primitives + enums; deeper
  shapes fall back to a raw-JSON field. If a real module (Lelanea) needs a richer control (e.g. an
  array-of-objects editor), that's an additive descriptor type + renderer later — not a v1 blocker.

## Done when (feature)

An operator's module-config write is validated against the module's own registered Zod schema and
stored on `Module.config`; every save captures a point-in-time `ModuleVersion` snapshot with author +
change summary; a prior version can be restored (re-validated, snapshotted forward); the config +
version history + the schema→descriptor engine are exposed through admin-guarded framework APIs; and
the whole path is proven by mocked-prisma tests — **with the client generic-form + version-history tab
deferred to f-ops-views (15)** (API-first, the 03/07 split). No upstream Sunrise issue (pure
framework-tier). **Unblocks `f-ops-views` (15)** (its last remaining blocker alongside the shipped
f-module-bindings + f-journey-state).

## References

- [[plan#06 · `f-module-config` — config form + versioning|plan.md feature 06]] — parent.
- [[framework-architecture#4. Modules|spec §4.1]] + Appendix A (A4 Zod config, A10 `ModuleVersion`), X1.
- [[f-module-core]] — the `Module` row, `ModuleDefinition.configSchema`, the registry this reads.
- [[f-map]] — the framework-tier version-service structure to mirror (its point-in-time cousin).
- [[f-module-bindings]] — the `createdBy` hand-FK pattern (t-3) + the shared `route-params`/`prisma-errors` helpers.
- [[planning-retro]] — fold feature-plan-authoring lessons here as they surface (§B).
</content>

</invoke>

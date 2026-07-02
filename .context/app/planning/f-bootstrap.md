---
name: f-bootstrap
feature: 02 · f-bootstrap
epic: Framework v1
status: in flight (planning)
owner: TBD
depends_on: f-seams (shipped — Sunrise v0.5.0)
spec: framework-architecture.md §3.1, §9.x, Appendix B (X6)
parent: plan.md
opened: 2026-07-02
---

# f-bootstrap — fork + skeleton + boundary

> Feature-level build plan for **`f-bootstrap`**, the framework repo's home and its
> enforced boundary. Parent: [[plan#02 · `f-bootstrap` — fork + skeleton + boundary|plan.md]].
> Binding _how_: [[framework-architecture]] Appendix B (X6) + [[framework-architecture#3.1 Proposed placement in the repo|§3.1]].
> Sizing follows the parent plan: **task = one PR** (~200–600 lines, cohesive, reviewable); commits sit below this resolution.

## Intent

Stand up the empty framework layer inside the Daybreak fork so every later feature
(`f-module-core`, `f-map`, `f-slots`, …) has a home, a shared scope vocabulary, and an
**enforced** framework↔Sunrise boundary from day one. Nothing functional ships here — the
deliverable is a skeleton that builds, boots, migrates clean, and whose boundary CI
_provably fails_ on a deliberate cross-boundary import. Per Appendix B, the boundary must
land in Phase 1, not a later cleanup pass — the temptation to shortcut through core peaks at
Phase 4 (chat integration), and an unenforced boundary decays silently.

## Reconciliation with current repo reality

The rev-16 spec was written before the fork existed and before Sunrise shipped two
conventions we now inherit. Three adaptations, each a deliberate choice to record:

1. **The fork already exists — indicative task 1 is essentially done.** Daybreak is a live
   fork of Sunrise; `NEXT_PUBLIC_APP_NAME` branding is wired (`lib/brand.ts`, `lib/env.ts`);
   the `framework ← Sunrise` upstream-merge procedure is documented in
   [[README|.context/app/README.md]] ("Pulling an upstream Sunrise release") + `CUSTOMIZATION.md §9`
   and has been **exercised for real** (the v0.5.0 merge, PR #4). The spec's target file
   `.context/framework/upstream.md` is **superseded** by those. → No PR needed; recorded as
   done below.

2. **Docs namespace: `.context/app/`, not `.context/framework/`.** Sunrise shipped the
   fork-owned `.context/app/` convention (upstream #371, in v0.5.0) _after_ the spec named
   `.context/framework/`. `.context/framework/` would sit outside the fork-owned tree and
   risk being read as Sunrise's. → Framework docs live under **`.context/app/`** (this
   planning tree already does). Use `.context/app/framework/` for the framework domain docs.

3. **Schema/migration prefix: keep the spec's `framework_`, not the generic `app_`.**
   `CLAUDE.md`/README give leaf-app forks the generic guidance "models in `app.prisma`,
   migrations named `app_…`." Daybreak is not a leaf app — it is the framework layer, and
   Appendix B's boundary **CI keys on the `framework_` prefix** (migration-hygiene + zero-vocab
   checks). → Framework schema uses **`prisma/schema/framework-*.prisma`** with `framework_`
   table names and `framework_`-prefixed migrations, exactly as §3.1/Appendix B specify. The
   `app_…` convention remains available for genuinely app-level (non-framework) additions, but
   the framework's own DDL follows `framework_`. _(Decision to confirm — see Open questions.)_

Concrete reuse anchors found in-tree:

- **ESLint** is flat config (`eslint.config.mjs`) with an existing `lib/app/**` boundary block
  using `@typescript-eslint/no-restricted-imports` (note the documented flat-config gotcha:
  `no-restricted-imports` _replaces_, does not merge). This is the pattern to extend for
  `lib/framework/**`.
- **CI** lives in `.github/workflows/ci.yml` — where the migration-hygiene and zero-framework-
  vocab checks are added.
- **`prisma/schema/`** is a folder of flat per-domain files (`orchestration-*.prisma`, etc.);
  Prisma picks up any file in it, so `framework-*.prisma` files register by presence.
- **Boot wiring**: `f-seams` shipped the fork-owned `lib/app/context-contributors.ts` →
  `initAppContextContributors()`, which Sunrise auto-wires. `initFramework()` registers through
  _that_ seam (below), so we never edit a core call site.

## Tasks (promoted)

| ID  | Task                                                                    | Files                                                                                            | Deps | Status    | PR  |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- | --------- | --- |
| t-0 | Fork + branding + upstream-merge procedure                              | _(history: fork, brand env, `.context/app/README.md`, PR #4)_                                    | —    | **done**  | #4  |
| t-1 | `lib/framework/` skeleton + `shared/scope.ts` + empty schema            | `lib/framework/{modules,facilitation,data-slots,shared}/`, `prisma/schema/framework-*.prisma`    | t-0  | available | —   |
| t-2 | Boundary enforcement (X6): ESLint + CI, provably failing                | `eslint.config.mjs`, `.github/workflows/ci.yml`, `scripts/`, a deliberate-violation fixture      | t-1  | backlog   | —   |
| t-3 | `initFramework()` wiring + `.context/app/framework/` + test scaffolding | `lib/framework/index.ts`, `lib/app/context-contributors.ts`, `.context/app/framework/`, `tests/` | t-1  | backlog   | —   |

t-2 and t-3 parallelise once t-1 lands. Three real PRs (t-0 already merged) — inside the
parent plan's `~4 PRs` estimate.

### t-1 · `lib/framework/` skeleton + scope vocabulary + empty schema

The subtree and the one file with real content this PR ships: `shared/scope.ts`.

- Create `lib/framework/{modules,facilitation,data-slots,shared}/` mirroring how
  `lib/orchestration/` holds interlocking subdomains under one umbrella (§3.1).
- **`lib/framework/shared/scope.ts`** owns the one scoping vocabulary — the `moduleSlug` /
  `nodeKey` / `scope` types that appear on slots, bindings, `CapabilityContext.scope` entries,
  workflow bindings, and journey events (spec §7, "One scoping vocabulary"). It lives on the
  framework side of the boundary so the vocabulary never leaks into core types.
- Register empty `prisma/schema/framework-modules.prisma`, `framework-facilitation.prisma`,
  `framework-data-slots.prisma` (headers/`@@map` conventions only, **no models yet** — the first
  tables arrive in `f-module-core`).
- **Done when:** `npm run type-check` + `prisma validate` pass; `db:migrate:status` is clean
  (empty schema files add no DDL, so there is no migration to generate — the "empty schema
  migrates clean" bar means _adding the files doesn't break validate/status_).

### t-2 · Boundary enforcement (X6) — the load-bearing PR

Appendix B's three mechanisms, all shipped here, all CI-verified:

1. **ESLint import boundary**, extending the `lib/app/**` pattern to **all** framework paths
   (`lib/framework/**`, and reserved-now `app/admin/framework/**`,
   `app/api/v1/admin/framework/**`), in **both** directions: no core/app-shell file imports a
   framework path; framework paths import core only through its public seams.
2. **Migration hygiene** (CI): `framework_`-prefixed migration folders may contain only
   `framework_*` DDL, never mixed with Sunrise DDL (the ESLint rule can't see SQL, so this is a
   separate script/check in `ci.yml`).
3. **Zero framework vocabulary in Sunrise-side code**: no framework-named field/type/string on a
   core type (a `moduleId` on a core type fails; a generic `scope` map passes).

- **Proof obligation (from the plan):** the boundary must _fail on a deliberate cross-boundary
  import_. Include a fixture + a CI assertion that the rule red-flags it (kept out of the normal
  build, or asserted via an expected-error test), so a green main means the boundary genuinely bites.
- **Done when:** all three checks run in `ci.yml` and green on a clean tree; the deliberate
  violation is provably caught.

### t-3 · `initFramework()` wiring + doc namespace + test scaffolding

- **`initFramework()`** (e.g. `lib/framework/index.ts`) is the framework's single aggregate init
  and its only touch point into the boot sequence. For now it registers an **empty** framework
  context contributor via the `f-seams` `registerContextContributor()` registry. Wire it through
  the fork-owned `lib/app/context-contributors.ts` → `initAppContextContributors()` (which Sunrise
  already auto-wires), so **no core call site is edited** — the boundary stays clean.
- **`.context/app/framework/`** doc namespace created with a short README (what the layer is, link
  back to spec + this plan). Under `.context/app/`, per reconciliation #2.
- **Test scaffolding**: unit + integration test folders for `lib/framework/`, plus one boundary
  test asserting `buildContext()` gains exactly one contributor when the framework is initialised
  (and, mirroring the `f-guidance` boundary test later, one fewer when stripped) — proving the seam
  is registry-shaped, not welded.
- **Done when:** `initFramework()` runs at boot registering its (empty) contributor; the
  contributor-count test passes; docs namespace exists.

## Done when (feature)

Fork builds and boots; `lib/framework/` skeleton + `shared/scope.ts` present; empty
`framework-*.prisma` validate and migrate clean; boundary checks (ESLint + 2 CI checks) are green
and **provably catch** a deliberate violation; `initFramework()` registers an empty context
contributor through the fork-owned seam without editing core.

## Open questions / decisions to confirm

- **Schema prefix (reconciliation #3).** Confirm `framework_` (spec/Appendix B) over the generic
  `app_` (README) for the framework's own DDL. Recommended: `framework_`, because Appendix B's CI
  checks depend on it and the whole spec is written around it. _Blocks t-1's schema-file naming and
  t-2's migration-hygiene regex._
- **`initFramework()` composition.** Confirm routing framework registration _through_
  `initAppContextContributors()` (keeps core untouched) vs a distinct auto-wired call site.
  Recommended: through the existing app seam. _Shapes t-3._
- **Not blocking f-bootstrap, but confirm before `f-module-core`:** that Sunrise #368
  (`executeTransaction` tx options) is present in v0.5.0 — the plan assumes it for boot-time bulk
  upserts (module/slot/map sync). Out of scope here; flagged so it isn't discovered late.

## Risks

- **Boundary rule too loose or too tight.** The flat-config `no-restricted-imports` _replace_ (not
  merge) behaviour is a known footgun (documented in `eslint.config.mjs`); getting the
  `lib/framework/**` override right without disabling the `lib/app/**` rules needs care. Mitigation:
  the deliberate-violation fixture in t-2 is exactly the regression guard.
- **CI checks that can't see SQL.** Migration hygiene is script-based, not ESLint; easy to under-
  specify. Mitigation: assert on a known-bad sample migration in the check's own test.
- **Spec drift.** Two reconciliations already; more may surface as later features meet v0.5.0
  reality. Mitigation: record each as a decision in [[plan#Decisions log|plan.md's decisions log]]
  rather than silently diverging from the spec.

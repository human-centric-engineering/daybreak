---
name: f-bootstrap
feature: 02 · f-bootstrap
epic: Framework v1
status: in flight (planning)
owner: Simon Holmes
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

**The boundary is two-directional (three-tier model).** Daybreak is not a leaf app — it is a
framework that will itself be forked by apps (Lelanea et al.). So it must apply Sunrise's own
discipline _one tier up_: own `lib/framework/` + `.context/framework/`, and **reserve** the
leaf surface (`lib/app/*`, `.context/app/`, `prisma/schema/app.prisma`) empty for its forks —
never occupy it. Daybreak registers its framework pieces into Sunrise's seams **from within
`lib/framework/`** (driven by `initFramework()`), exactly as Sunrise registers its built-ins
from core and leaves `lib/app/*` empty. The tier model and ownership table live in
[[README|.context/framework/README.md]]; f-bootstrap is where the code side of it is first
enforced.

## Reconciliation with current repo reality

The rev-16 spec predates both the fork and the three-tier realisation. Three adaptations,
each a deliberate choice to record:

1. **The fork already exists — indicative task 1 is essentially done.** Daybreak is a live
   fork of Sunrise; `NEXT_PUBLIC_APP_NAME` branding is wired (`lib/brand.ts`, `lib/env.ts`);
   the `framework ← Sunrise` upstream-merge procedure is documented in
   [[README|.context/framework/README.md]] ("Pulling an upstream Sunrise release") + `CUSTOMIZATION.md §9`
   and has been **exercised for real** (the v0.5.0 merge, PR #4). The spec's target file
   `.context/framework/upstream.md` is **superseded** by those. → No PR needed; recorded as
   done below.

2. **Daybreak's docs live in `.context/framework/`; `.context/app/` is reserved for leaf
   apps.** The spec named `.context/framework/`; an earlier draft of this plan wrongly moved it
   to `.context/app/`. But `.context/app/` is the namespace Sunrise reserves for _its_ forks —
   and Daybreak, being a framework with its _own_ forks, must reserve it in turn (three-tier
   model, above). → Daybreak docs under **`.context/framework/`** (done in this PR); `.context/app/`
   kept **empty**. The same reservation applies to code: `lib/app/*` scaffolds and
   `prisma/schema/app.prisma` stay empty/unused by Daybreak, for the leaf app to fill.
   _(Decision: 2026-07-02 — see [[plan#Decisions log|plan.md's decisions log]].)_

3. **Schema/migration prefix: keep the spec's `framework_`, not the generic `app_`.**
   `CLAUDE.md`/README give leaf-app forks the generic guidance "models in `app.prisma`,
   migrations named `app_…`." Daybreak is not a leaf app — it is the framework layer, and
   Appendix B's boundary **CI keys on the `framework_` prefix** (migration-hygiene + zero-vocab
   checks). → Framework schema uses **`prisma/schema/framework-*.prisma`** with `framework_`
   table names and `framework_`-prefixed migrations, exactly as §3.1/Appendix B specify. The
   `app_…` convention remains available for genuinely app-level (non-framework) additions, but
   the framework's own DDL follows `framework_`. _(Decided 2026-07-02: `framework_` tables with
   clean Prisma model names — see [[plan#Decisions log|decisions log]].)_

Concrete reuse anchors found in-tree:

- **ESLint** is flat config (`eslint.config.mjs`) with an existing `lib/app/**` boundary block
  using `@typescript-eslint/no-restricted-imports` (note the documented flat-config gotcha:
  `no-restricted-imports` _replaces_, does not merge). This is the pattern to extend for
  `lib/framework/**`.
- **CI** lives in `.github/workflows/ci.yml` — where the migration-hygiene and zero-framework-
  vocab checks are added.
- **`prisma/schema/`** is a folder of flat per-domain files (`orchestration-*.prisma`, etc.);
  Prisma picks up any file in it, so `framework-*.prisma` files register by presence.
- **Boot wiring**: `f-seams` shipped `registerContextContributor()` + the fork-owned
  `lib/app/context-contributors.ts` scaffold. Daybreak registers its framework context
  contributor by **calling `registerContextContributor()` from within `lib/framework/`**
  (driven by `initFramework()`) — _not_ by editing `lib/app/context-contributors.ts`, which is
  the leaf's scaffold and must stay empty. `initFramework()` itself is invoked at boot via a generic
  `initApp()` seam in `instrumentation.ts` → reserved-empty `lib/app/bootstrap.ts` (resolved — see
  Open questions).

## Tasks (promoted)

| ID  | Task                                                         | Files                                                                                                | Deps | Status   | PR  |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---- | -------- | --- |
| t-0 | Fork + branding + upstream-merge procedure                   | _(history: fork, brand env, `.context/framework/README.md`, PR #4)_                                  | —    | **done** | #4  |
| t-1 | `lib/framework/` skeleton + `shared/scope.ts` + empty schema | `lib/framework/{modules,facilitation,data-slots,shared}/`, `prisma/schema/framework-*.prisma`        | t-0  | done     | #6  |
| t-2 | Boundary enforcement (X6): ESLint + CI, provably failing     | `eslint.config.mjs`, `.github/workflows/ci.yml`, `scripts/boundary/`, a deliberate-violation fixture | t-1  | done     | #8  |
| t-3 | `initFramework()` wiring + boot seam + test scaffolding      | `lib/framework/index.ts`, `instrumentation.ts`, `lib/app/bootstrap.ts` (filled), `tests/`            | t-1  | backlog  | —   |

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

**Shipped (PR #8).** ESLint: the base `no-restricted-imports` gains a `@/lib/framework` group
(core → framework ban); a new framework-tier block (`lib/framework/**` + reserved
`app/**/framework/**`) restates the @/-alias ban, drops the self-ban, and adds a leaf-surface ban
(`@/lib/app/**`) — the framework can't import its own consumer. `lib/app/**` stays exempt (leaf
tier, the sanctioned boot bridge). **Test files are exempt from the framework-ban** (restated
relative-only): tests ship in no build, so the build-time constraint doesn't apply, and a
framework's own tests must import it. The two SQL-blind checks live as pure functions in
`scripts/boundary/lib.ts` (14 unit tests on known-good/bad samples) behind `scripts/boundary/check.ts`
(`npm run check:boundary`), which also lints the ignored fixture with `--no-ignore` and asserts the
rule fires. Wired into the CI `lint` job (no DB needed). All four import directions verified by
probe: core→fw FLAGGED, fw→leaf FLAGGED, leaf→fw allowed, fw→core allowed.

### t-3 · `initFramework()` wiring + test scaffolding

_(The `.context/framework/` doc namespace already exists — created in the reorg PR that
established the three-tier convention — so this task no longer creates it.)_

- **`initFramework()`** (e.g. `lib/framework/index.ts`) is the framework's single aggregate init.
  It registers an **empty** framework context contributor by calling the `f-seams`
  `registerContextContributor()` from **within `lib/framework/`** — never by editing the leaf's
  `lib/app/context-contributors.ts`, which stays empty.
- **Generic boot seam (built as the final upstream shape):** add `initApp()` to Sunrise's
  `instrumentation.ts` `register()`, calling a reserved **empty-by-default** `lib/app/bootstrap.ts`.
  Daybreak's _filled_ `lib/app/bootstrap.ts` `await import('@/lib/framework')` → `initFramework()`,
  then delegates to a fresh empty leaf hook. Core carries no `@/lib/framework` reference (build-time
  constraint — see Open questions). Sits outside `instrumentation.ts`'s existing dev-only
  early-returns (framework init must run in prod too, nodejs runtime). File the upstream Sunrise
  issue as/after this task, referencing the working impl.
- **Test scaffolding**: unit + integration test folders for `lib/framework/`, plus one boundary
  test asserting `buildContext()` gains exactly one contributor when the framework is initialised
  (and, mirroring the `f-guidance` boundary test later, one fewer when stripped) — proving the seam
  is registry-shaped, not welded.
- **t-2 ↔ t-3 coupling:** the `instrumentation.ts` → `lib/app/bootstrap.ts` → `lib/framework` path
  is the single sanctioned core→framework import; **t-2's boundary rule must whitelist it** or t-3
  red-flags CI. Ship the exception in t-2, don't discover it in t-3.
- **Done when:** `initFramework()` runs at boot via the generic `initApp()` seam registering its
  (empty) contributor, with the leaf surface left empty; the contributor-count test passes; the
  boundary CI is green (boot file whitelisted); **and the combined upstream Sunrise issue (boot seam
  - `/framework` namespace reservation) is filed** (see [Upstream follow-ups](#upstream-follow-ups))
    — t-3 is not done until it's raised.

## Done when (feature)

Fork builds and boots; `lib/framework/` skeleton + `shared/scope.ts` present; empty
`framework-*.prisma` validate and migrate clean; boundary checks (ESLint + 2 CI checks) are green
and **provably catch** a deliberate violation; `initFramework()` registers an empty context
contributor from within `lib/framework/` via a Daybreak-owned boot hook, with the leaf surface
(`lib/app/*`, `.context/app/`) left empty.

## Open questions / decisions to confirm

- **Schema prefix (reconciliation #3) — RESOLVED 2026-07-02.** `framework_` table prefix +
  **clean** Prisma model names (`model Module { @@map("framework_module") }`, `prisma.module.…`).
  The three-tier model settles it against `app_`, which is the _leaf app's_ namespace and would
  tangle Daybreak's DDL with Lelanea's. Model names stay unprefixed for client ergonomics —
  accepted low risk: if a future Sunrise model name ever collides, rename the framework-side model.
  Unblocks t-1 schema naming + t-2 migration-hygiene regex.
- **`initFramework()` boot hook — RESOLVED 2026-07-02.** A generic boot seam, built correctly in
  the fork as its final shape (per [[plan#Decisions log|the fork-first-informs-upstream approach]] —
  not a stopgap): Sunrise's `instrumentation.ts` `register()` calls a generic `initApp()` from a
  reserved, **empty-by-default** `lib/app/bootstrap.ts`; Daybreak's _filled_ copy of that scaffold
  does `await import('@/lib/framework')` → `initFramework()`, then delegates to a fresh empty leaf
  hook. **Core never references `@/lib/framework`** — the specifier lives only in the fork-owned
  filled scaffold, so Sunrise/ConQuest (no `lib/framework/`) never resolve it. This is a hard
  constraint, not a preference: a static dynamic-import specifier is resolved at **build** time, so
  `next build` in Sunrise/ConQuest would fail on it — a runtime guard wouldn't help; the reference
  must be _absent_, not caught. It's the `lib/app/capabilities.ts` pattern applied to boot. Because
  Daybreak writes the `instrumentation.ts` → `initApp()` change as the final generic shape, the
  eventual upstream adoption merges cleanly and Daybreak keeps only its filled scaffold. **File the
  upstream Sunrise issue as/after t-3, referencing the working in-fork impl** (upstream may refine
  for its own guardrails — propose, adopt what lands). **t-2 whitelists the boot file as the single
  sanctioned core→framework path** (see t-2 ↔ t-3 coupling below).

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
- **Spec drift.** Three reconciliations already (one a mid-plan correction); more may surface as
  later features meet v0.5.0 reality and the three-tier model. Mitigation: record each as a decision
  in [[plan#Decisions log|plan.md's decisions log]] rather than silently diverging from the spec.

## Upstream follow-ups

Cross-repo actions this feature owes Sunrise (per the
[[plan#Decisions log|fork-first-informs-upstream]] model — build it correctly here, then promote
the generic part). Tracked here so they don't get lost in prose.

- [ ] **File one Sunrise issue covering both framework-tier concerns, together** (decided: bundle,
      don't stagger). It covers:
  1. **Reserve the `/framework` namespaces** — `lib/framework/`, `.context/framework/`, and the
     `framework-*.prisma` / `framework_` schema+table prefix, reserved for a **framework-layer fork**
     exactly as Sunrise #371 reserved `/app` for leaf forks: **Sunrise core must never create files
     or tables there.** Generalises the convention to two reserved tiers — `/app` (leaf forks) +
     `/framework` (framework forks) — in the same docs #371 touched (`CLAUDE.md`,
     `.context/substrate.md`, `CUSTOMIZATION.md`).
  2. **The generic `initApp()` boot seam** — a `register()` call in `instrumentation.ts` invoking a
     reserved, empty-by-default `lib/app/bootstrap.ts`, zero framework vocabulary.
  - **Trigger:** once t-3's boot seam is working in Daybreak, so the issue links the proven in-fork
    implementation (as f-seams was raised as Sunrise #372). Filing the combined issue **gates t-3's
    Done-when.** Owner: the t-3 owner. _(Accepted tradeoff: the `/framework` reservation alone isn't
    gated on t-3 and its collision risk is mildly time-sensitive; bundling trades a small delay for
    a single clean filing.)_

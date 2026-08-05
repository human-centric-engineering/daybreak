---
name: f-release
feature: 24 · f-release
epic: Framework v1.2 (distribution)
status: shipped
owner: Simon Holmes
shipped: 2026-08-05 — one PR (#187), three commits (t-1 · t-2 · t-3); released as daybreak-v0.1.0
depends_on: none — no framework runtime dependency; consumes the fork-owned `app:ci-checks` CI seam and sits beside the existing `lib/sunrise-version.ts` / `lib/app-version.ts` pair
spec: no framework-architecture section — this is distribution machinery, not framework capability. Governed by the three-tier ownership model in [[README]] and Sunrise's own [`VERSIONING.md`](../../VERSIONING.md) / [`CUSTOMIZATION.md` §9](../../CUSTOMIZATION.md) one tier up.
parent: plan.md
opened: 2026-08-05
planned: 2026-08-05
---

# 24 · `f-release` — Daybreak release & leaf distribution

## Intent

Daybreak has shipped 23 features and now has a **real dependent leaf**
(`human-centric-engineering/reclaim-your-week`, John). It publishes **no releases,
no version constant, no changelog, and no leaf-facing sync guide.**

Concretely, a leaf today can only `git merge daybreak/main` — an unversioned moving
target with no known-good point — and has **no way to learn that a leaf-facing
contract changed** except by reading the diff. That is not hypothetical: the
Sunrise v0.8.0 sync (#181) made `lib/app/data-export.ts` Daybreak-owned and
introduced a new reserved `lib/app/leaf-data-export.ts`. A leaf that fills
`data-export.ts` — the file Sunrise's own docs tell it to fill — now collides with
Daybreak on its next merge, in a GDPR path. Nothing currently tells it not to.

This feature builds the **distribution tier**: the version constant a leaf merges
through, the release/tag convention, a changelog with a CI guard that keeps it
honest, and the leaf-facing sync guide. It is the mirror, one tier up, of what
Sunrise already does for Daybreak (`lib/sunrise-version.ts` + `CHANGELOG.md` +
`VERSIONING.md` + `CUSTOMIZATION.md` §9).

**Why now:** the board closed with v1.1, and the first leaf exists and is already
one Sunrise major behind. The cost of not doing it is paid by every leaf, repeatedly.

---

## Reconciliation with current repo reality (verified 2026-08-05)

Per [[building-a-feature]] step 1 — every assumption below was checked against the
tree, not the intent.

### 1. Daybreak publishes no tags; the ten local tags are **Sunrise's**

`git ls-remote --tags origin` returns **zero**. The ten tags in a dev clone
(`v0.0.1` … `v0.8.0`) arrived via `git fetch upstream --tags`; `v0.8.0` points at
`45e704d9 chore(release): Sunrise 0.8.0 (#527)`.

Two consequences, both binding:

- **Tags must be prefixed — `daybreak-vX.Y.Z`.** An unprefixed `v0.9.0` would be
  ambiguous in any clone holding both remotes, and would collide outright when
  Sunrise cuts its own `v0.9.0`.
- **Never `git push --tags` from a dev clone.** It would publish Sunrise's ten tags
  onto Daybreak's origin. Releases push one explicit ref: `git push origin daybreak-vX.Y.Z`.

### 2. The version constant **cannot** live in `lib/framework/` — this is forced

`lib/framework/eslint.config.mjs` bans `@/lib/framework` imports from every
`**/*.{ts,tsx}` except `lib/framework/**`, `lib/app/**`, framework tests and
`scripts/smoke/**`. `app/api/health/route.ts` is core and **not** exempt, so it
could never import a constant living in the framework tier — and a static
`@/lib/framework` specifier resolves at build time, which is the whole reason the
ban exists.

→ **`lib/daybreak-version.ts`**, at `lib/` root, symmetric with
`lib/sunrise-version.ts`. Not a preference; the boundary decides it.

### 3. The boundary vocab scan does not trip

`FRAMEWORK_VOCAB` (`scripts/boundary/lib.ts:156`) is
`['moduleSlug', 'nodeKey', 'moduleId', 'dataSlot']` — domain tokens only. A
`DAYBREAK_VERSION` constant in core-adjacent code introduces none of them.

### 4. The health route has no seam — a core edit across **5 files**, deliberately

> **Corrected at build (t-1).** The plan estimated "2 lines, one file". That was
> wrong: the response is typed AND mirrored by a Zod schema AND asserted by two
> Sunrise test files, all of which must move together. Recorded here rather than
> quietly absorbed, because it changes the cost of the decision.

`app/api/health/route.ts` imports `APP_VERSION` and `SUNRISE_VERSION` directly and
builds the response in one place, but the shape is pinned in four more:

| File                                                    | Change                                      |
| ------------------------------------------------------- | ------------------------------------------- |
| `lib/monitoring/types.ts`                               | `daybreak: string` on `HealthCheckResponse` |
| `lib/validations/monitoring.ts`                         | `daybreak: z.string()` on the Zod mirror    |
| `app/api/health/route.ts`                               | import + field + doc block                  |
| `tests/unit/lib/validations/monitoring.test.ts`         | fixture + a "rejects missing" case          |
| `tests/unit/components/status/use-health-check.test.ts` | two fixtures                                |
| `tests/integration/api/health.test.ts`                  | mirrors the three `sunrise` assertions      |

**Still worth doing, and it was re-decided rather than assumed:** every edit is an
additive one-liner (a "keep both" on a future sync, not a restructure); Sunrise set
this exact precedent — type + Zod mirror + a rejects-missing test — when _it_ added
`sunrise` for forks, so this follows a pattern rather than inventing one; and
without it `DAYBREAK_VERSION` would be a constant with **no runtime consumer at
all**, which is both inert and untestable end-to-end.

The field is **required**, not optional, in both the type and the schema — an
optional field would let a stripping proxy or an older deployment pass silently,
which is the failure the schema exists to catch.

### 5. `app:ci-checks` is the lawful home for the changelog guard

`package.json` already defines `"app:ci-checks": "npm run framework:boundary"`, and
`.github/workflows/ci.yml` invokes it as Sunrise's **fork-owned CI seam**. The
changelog check extends that script — **no Sunrise file is edited**, and it survives
upstream syncs untouched.

### 6. Root `CHANGELOG.md` / `VERSIONING.md` are Sunrise-owned

The [[../../CLAUDE|CLAUDE.md]] banner lists both as do-not-edit. Daybreak's live in
its own tree: `.context/framework/CHANGELOG.md` and `.context/framework/VERSIONING.md`.

### 7. The first leaf is real, shares history, and is one Sunrise major behind

`reclaim-your-week` resolves Daybreak commit `c9e9fa26`, so `git merge` works
normally (GitHub reports `isFork: false`, but that is only the GitHub relationship —
the git ancestry is intact). Its `lib/app/` has `leaf-admin-nav.ts`,
`leaf-bootstrap.ts`, `leaf-db-drift.ts` and its own `lib/app/programme/`, but lacks
`csp.ts`, `jobs.ts`, `user-created.ts` and `data-export.ts` — all four Sunrise 0.8.0
additions. It is therefore **exactly at pre-0.8.0 Daybreak** and can consume the
first release immediately.

### 8. `lib/app-version.ts` reads `package.json` — which is why a constant is needed

In a **leaf**, `package.json.version` becomes the _leaf's_ version (reclaim already
sets `name: reclaim-your-week`, `version: 0.1.0`). So Daybreak's own version cannot
be inferred from it downstream; it needs a dedicated constant that merges through,
exactly as Sunrise does.

### 9. `plan.md`'s Project table is stale

It records _"tracking `upstream`, at Sunrise v0.5.0"_ (now **0.8.0**) and _"First app:
Lelanea"_ (the first actual leaf is `reclaim-your-week`). Corrected in this claim PR.

---

## The shape decisions (read this first)

### A. First release is `daybreak-v0.1.0`; `package.json` is untouched

Decided by the owner. The tag records where Daybreak **is**, rather than asserting a
maturity level, and it matches `package.json.version` as it already stands — so the
version-parity guard in t-1 passes with no bump. `1.0.0` is reserved for the point
Daybreak is willing to promise leaves a stable contract.

`0.x` carries Sunrise's own alpha semantics, restated for Daybreak: **expect real
merge work between any two releases.**

### B. Daybreak's public surface — the tight definition

The changelog and the version's meaning are only as useful as the surface they
describe. A leaf may depend on:

- the `lib/app/*` **bridges** Daybreak fills (`bootstrap.ts`, `admin-nav.ts`,
  `data-export.ts`) and the reserved **`leaf-*`** seams they delegate to
- `registerModule()` and the framework registration seams driven by `initFramework()`
- `framework_*` Prisma models and their published shapes
- framework admin routes (`/admin/framework/**`, `/api/v1/**/framework/**`)
- exported values from `lib/framework/**` that a leaf is documented to call

Internal refactors inside `lib/framework/` that change none of the above do **not**
belong in the changelog — the same signal-preserving rule Sunrise applies.

### C. ~~Three tasks, a chain~~ → **one PR** (re-sized at build)

> **Corrected during t-1, by the owner.** The three tasks were planned as three
> PRs. They are a strict chain (t-2's changelog references the contract t-1
> defines; t-3's guard needs the file t-2 creates), and once t-1 was built it was
> obvious the remaining two were **two docs and one small script** — precisely the
> case [[building-a-feature]]'s sizing self-check calls a commit, not a PR
> ([[planning-retro#B1|B1]]). I had applied the chain reasoning ("they depend on
> each other, so they're sequential") and skipped the size question.
>
> Folded onto the existing t-1 branch rather than opening two more. The three
> **commits** remain separate so the history still reads as three steps.

The chain is real; it just argues for one PR built in order, not three PRs.

### D. The release itself is a **process step**, not a task

Cutting `daybreak-v0.1.0` and onboarding reclaim follow the VERSIONING doc once
merged. Neither is a code change, so neither is a PR.

---

## Which seams this feature builds vs consumes

| Seam                            | Builds / consumes | Note                                                  |
| ------------------------------- | ----------------- | ----------------------------------------------------- |
| `lib/daybreak-version.ts`       | **builds**        | New. Leaves merge it through; they never edit it.     |
| `app:ci-checks`                 | consumes          | Sunrise's fork-owned CI seam; extended, not replaced. |
| `app/api/health/route.ts`       | **minimal edit**  | 2 lines. Documented as a deliberate core edit.        |
| `.context/framework/` docs tree | **builds**        | Daybreak-owned; no conflict surface upstream.         |
| `lib/sunrise-version.ts`        | untouched         | Merged through from upstream, as always.              |

---

## Framework-tier assessment (B17 — confirm at build)

Expected: **no migration, no `framework_*` schema, no `lib/framework/` runtime code.**
One deliberate 2-line core edit (§4). Everything else is a new root-level file, the
fork-owned CI seam, and the Daybreak-owned docs tree.

---

## Test strategy (house style)

vitest on `happy-dom`, no live DB — nothing here touches Prisma.

- **t-1** — the constant's semver shape; a **parity guard** asserting
  `DAYBREAK_VERSION === package.json.version` (without it the two drift the first
  time someone bumps one and forgets the other, and a leaf then reads a version that
  never existed); an extension of the existing health-route test asserting the
  `daybreak` field, so a future refactor of the response shape cannot silently drop it.
- **t-3** — the guard is a **pure function over (changed file list) → violation?**,
  so it is table-driven and needs no git: public-surface path + no changelog → fails;
  changelog touched → passes; docs/test-only change → passes; a `lib/framework/`
  internal with no public-surface path → passes. The CLI wrapper that feeds it
  `git diff --name-only` stays a thin shell over the tested function.

---

## Tasks (promoted)

| ID  | Task                                                                                                                                                                                                                                                                                                    | Files (indicative)                                                                                                                                                            | Deps | Status   | PR   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------- | ---- |
| t-1 | **The version contract** — `DAYBREAK_VERSION` constant + the `daybreak` field on `/api/health` + `VERSIONING.md` (0.x semantics, the §B public surface, the `daybreak-vX.Y.Z` tag convention, release process)                                                                                          | `lib/daybreak-version.ts` (new), `app/api/health/route.ts` (+2 lines), `.context/framework/VERSIONING.md` (new), `tests/unit/lib/daybreak-version.test.ts` (new), health test | —    | **done** | #187 |
| t-2 | **Changelog + leaf-facing guide** — `CHANGELOG.md` seeded with the `0.1.0` entry (**must** carry the 0.8.0 leaf-contract change: `data-export.ts` now Daybreak-owned, new `leaf-data-export.ts`) + `building-on-daybreak.md` (reserved leaf surface, remote/fetch/merge recipe, migration interleaving) | `.context/framework/CHANGELOG.md` (new), `.context/framework/building-on-daybreak.md` (new), `.context/framework/README.md` (+links)                                          | t-1  | **done** | #187 |
| t-3 | **Changelog CI guard** — a pure public-surface→changelog checker + `framework:changelog` script wired into `app:ci-checks`                                                                                                                                                                              | `scripts/boundary/changelog.ts` (or `scripts/release/`), `package.json` (`app:ci-checks`), `tests/unit/scripts/…` (new)                                                       | t-2  | **done** | #187 |

**One PR, three commits** (decision C — re-sized at build). The task rows stay
distinct because they are genuinely three pieces of work with three "done when"s;
they simply ship together.

### Per-task "Done when"

Each task is done when: the code/doc exists as described; tests pass; **`/pre-pr`**
is clean; **`/security-review`** is clean (t-1/t-3 — t-2 is docs-only and skips it);
`npm run format && npm run format:check`; pushed; PR opened **against Daybreak
explicitly** (`--repo human-centric-engineering/daybreak`); **`/code-review`** run to
its full spec and confirmed findings fixed as a follow-up commit; and the board row
flipped to `done #<PR>` on merge.

---

## After the last task merges (the process steps, not tasks)

1. **Cut `daybreak-v0.1.0`** per the new VERSIONING doc — annotated tag on `main`,
   pushed as **one explicit ref** (`git push origin daybreak-v0.1.0`, never `--tags`),
   plus a GitHub release pointing at the changelog entry.
2. **Tell the leaf.** reclaim-your-week adds the remote and merges the tag; the
   changelog's `0.1.0` entry is what tells John not to fill `lib/app/data-export.ts`
   and to use `leaf-data-export.ts` instead.
3. **Close out** per [[building-a-feature]] §3 — board reconcile + a
   [[planning-retro]] §B lesson.

---

## Alternative shapes considered

- **Have leaves merge `daybreak/main` directly (no releases).** Works today with zero
  setup and is genuinely fine for one leaf. Rejected as the _end state_: no known-good
  point (main can be mid-sync, as it was for several hours today), no version to report
  in support, and no changelog — which is precisely the gap that lets a leaf-contract
  change go unnoticed.
- **Unprefixed `vX.Y.Z` tags.** Rejected — collides with Sunrise's tags in any clone
  with both remotes (§1).
- **Version constant in `lib/framework/version.ts`.** Impossible — the ESLint boundary
  forbids core importing it (§2).
- **A `daybreak` field via a new upstream health seam.** Disproportionate for two
  fields; the minimal core edit is the cheaper honest trade (§4). Revisit only if the
  health response grows more fork-tier content.
- **Enforce the changelog via `.claude/commands/pre-pr.md`.** Rejected — that file is
  Sunrise-owned and re-synced; `app:ci-checks` is the seam built for this (§5).

## Does NOT do

- No release **automation** (no GitHub Action cutting tags) — the first releases are
  cut by hand against a written checklist, and automation is a follow-up once the
  process has been exercised.
- No npm publish — Daybreak is `private: true` and consumed by git merge, not as a package.
- No backfilled per-feature changelog history. The `0.1.0` entry describes the surface
  **as it stands**, not 23 features retroactively; `plan.md`'s Work-completed log
  already holds that history.
- No change to how Daybreak consumes Sunrise.
- No work inside `reclaim-your-week` — that is the leaf's own repo and John's call.

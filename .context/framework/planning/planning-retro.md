---
name: planning-retro
description: Feedback from executing the Daybreak plan, to fold back into the plan-authoring instructions
parent: plan.md
---

# Planning-process feedback (retro)

**Purpose.** This is _not_ a project decisions log (that lives in
[[plan#Decisions log|plan.md]]). This is **feedback about the plan-authoring
process itself** — concrete lessons discovered while _executing_ the plan that
should be fed back into the agent instructions that generate plans like
[[plan|plan.md]], so the next plan is better from the start.

**How to use.** Append-only, newest at top. Each entry is:
**Discovery** (what execution revealed) → **Impact** (what it cost / risked) →
**Feedback** (the specific change to the planning instructions). When the
plan-authoring instructions are next revised, work through the open entries and
mark them `folded-in`.

---

## Entries

### 2026-07-02 — Don't emit commit-sized tasks; and don't count already-done work as a task

- **Discovery.** `f-bootstrap` was sized at ~4 PRs (t-0…t-3). In practice **t-0**
  ("fork Sunrise + branding + upstream procedure") was **already done** — the fork
  existed — so it was history, not work. And **t-1** ("skeleton + `scope.ts` + empty
  schema") turned out **commit-sized**: one small real file plus placeholders, empty
  schema, and a test. Its natural PR companion is **t-2** (the boundary that _enforces_
  the skeleton).
- **Impact.** The PR-count estimate was inflated by a non-task, and one task landed
  as a sliver PR — which the plan's _own_ rule forbids ("if a task reads like 'add one
  field + test', it's a commit inside a PR; fold it in"). The plan didn't self-apply
  its own sizing rule.
- **Feedback.** Planning instructions should: (a) **not turn already-satisfied work
  into a task** — check current repo state and mark such work `done (history)`, not a
  PR; (b) **run a sizing self-check on each task** — if a task's only real content is
  scaffolding + one small file, fold it into its dependent task (here: t-1 → t-2). Size
  by _real changed surface_, not by conceptual step count. _Status: open._

### 2026-07-02 — Verify "assumed done upstream" dependencies against the actual repo

- **Discovery.** The plan opened by stating `f-seams` "has already been done in Sunrise
  and exists in this repo." It had **not** — both seams were absent at the v0.4.1
  baseline; we had to file Sunrise #372 and pull them in via the v0.5.0 merge before any
  framework work could begin.
- **Impact.** A foundational dependency was assumed satisfied but wasn't; caught only
  because execution started by validating it. Had we built on the assumption, later
  tasks would have failed.
- **Feedback.** Planning instructions should require **verifying every "assumed
  landed / done upstream" dependency against the actual code** at plan time (grep for
  the seam, check the version), and record the evidence — never assert upstream state
  from the spec alone. _Status: open._

### 2026-07-02 — Model N-tier fork ownership when the artifact is itself a framework

- **Discovery.** The spec (rev 16) and the first plan draft treated Daybreak as a leaf
  app — using `.context/app/` and the `lib/app/*` scaffolds. But Daybreak is a
  **framework that will itself be forked** by apps (Lelanea). It must _reserve_ the leaf
  surface (`.context/app/`, `lib/app/*`) for its own forks and own a separate tier
  (`.context/framework/`, `lib/framework/`). This produced a mid-plan correction
  (f-bootstrap "reconciliation #2" was reversed).
- **Impact.** Docs were initially placed in the wrong namespace; a boot-seam design
  (t-3) had to be reworked so Daybreak registers from `lib/framework/` rather than
  occupying a leaf scaffold. Real rework surfaced only during execution.
- **Feedback.** When the thing being planned is **itself a platform/framework that gets
  forked**, planning instructions should model the **N-tier ownership** up front — which
  code/doc/schema surface is reserved for whose forks — instead of assuming a single
  "fork owns everything" tier. _Status: open._

### 2026-07-02 — Classify each cross-boundary seam by direction (fork→core vs core→fork)

- **Discovery.** The `f-seams` seams were **fork→core** (the fork calls _into_ a core
  registry) — trivially fork-owned. The boot hook (t-3) is the opposite: **core→fork**
  (core must call _out_ to the fork), which the spec/plan didn't distinguish. That
  direction is what forced the generic `initApp()` design and the build-time constraint
  (core can't even name `@/lib/framework` or Sunrise/ConQuest fail to build).
- **Impact.** The hardest design question in `f-bootstrap` was invisible in the plan
  until t-3 was designed; it needed a whole conversation to resolve.
- **Feedback.** Planning instructions should **classify every cross-boundary seam by
  direction**. Flag **core→fork** seams explicitly: they can't be pure fork-owned, they
  need a generic upstream mechanism, and they carry build-time/merge constraints. Surface
  them as first-class design questions at plan time, not at implementation time.
  _Status: open._

### 2026-07-02 — Bake the standard gates into each task's definition-of-done, before the PR

- **Discovery.** PR #6 (t-1) was opened **before** running `/pre-pr` and `/code-review`;
  the user had to prompt for them. Both then passed, but the sequencing was wrong — some
  gates (full test suite, DB migration-drift) should run _before_ opening the PR.
- **Impact.** A PR was opened in an unvalidated state; caught by the human, not the
  process.
- **Feedback.** The plan's task workflow / definition-of-done should **include the
  standard gates (`/pre-pr`, then `/code-review`) as steps that run before opening the
  PR**, not as optional afterthoughts. Make "gates green" part of what "task complete"
  means. _Status: open._

### 2026-07-02 — Keep the "reconcile spec against current repo reality" step (it worked)

- **Discovery.** `f-bootstrap.md` opened with an explicit "Reconciliation with current
  repo reality" section. It caught three spec-vs-reality gaps (fork already exists; docs
  namespace; schema prefix) _before_ coding — high value.
- **Impact.** Positive — this is what surfaced the corrections early rather than mid-code.
- **Feedback.** **Codify this as a standard first section of every feature plan**: before
  task breakdown, reconcile the (possibly stale) spec against the actual repo and record
  each adaptation as a decision. The rev-16 spec predated the fork _and_ conventions
  Sunrise shipped later — feature plans must expect that gap. _Status: keep — promote to
  a required planning step._

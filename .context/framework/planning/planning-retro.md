---
name: planning-retro
description: Feedback from executing the Daybreak plan, split by which plan-authoring agent it targets (overall-plan vs feature-plan)
parent: plan.md
---

# Planning-process feedback (retro)

**Purpose.** This is _not_ a project decisions log (that lives in
[[plan#Decisions log|plan.md]]). It is **feedback about the plan-_authoring_
process itself**, discovered while _executing_ the plan — to fold back into the
agent instructions that generate plans.

It is split by **which authoring agent** the lesson targets:

- **§A — Overall-plan authoring** — the agent that produces the whole-project
  breakdown ([[plan|plan.md]]: Project → Features → indicative tasks, the
  dependency graph, the working model, the decisions/work logs). **This is the
  priority section** — the overall-plan process is being baked into the **HCE
  Hub** (an internal tool built on Sunrise), so lessons here have the widest reuse.
- **§B — Feature-plan authoring** — the agent that produces a single feature's
  detailed build plan (e.g. [[f-bootstrap|f-bootstrap.md]]: reconciliation section,
  promoted tasks, per-task done-when, open questions, upstream follow-ups).

**How to use.** Append-only, newest at top, under the right section. Each entry is
**Discovery** (what execution revealed) → **Impact** (what it cost/risked) →
**Feedback** (the specific change to that agent's instructions). Some lessons touch
both levels; each is filed at its primary home with a cross-reference. Mark an entry
`folded-in` once the corresponding instructions are updated.

---

## §A — Overall-plan authoring (priority — feeds HCE Hub)

### A1 · Verify "assumed done / landed upstream" dependencies against reality before baking them in

- **Discovery.** plan.md asserted `f-seams` "has already been done in Sunrise and
  exists in this repo," and "assume the nine open Sunrise issues are cleared." In fact
  `f-seams` was **absent** at the v0.4.1 baseline — we had to file Sunrise #372 and pull
  it in via the v0.5.0 merge before any framework work could start.
- **Impact.** A foundational dependency (feature 01) was asserted from the spec/memo, not
  verified. Caught only because execution happened to start by validating it; building on
  the assumption would have failed downstream.
- **Feedback.** The overall-plan agent must **verify every external / "assumed landed
  upstream" dependency against actual state** (grep the seam, check the version/tag) and
  record the evidence — never assert upstream/external readiness from a spec or memo alone.
  Encode "verify, then state, with evidence" for any dependency the plan itself doesn't build.
  _Status: open._

### A2 · Model N-tier ownership when the project is itself a platform/framework that gets forked

- **Discovery.** The spec and the first plan draft framed Daybreak as a _leaf app_ on
  Sunrise (using `.context/app/`, `lib/app/*`). It is actually a **framework with its own
  forks** — it must reserve the leaf surface and own a separate tier (`.context/framework/`,
  `lib/framework/`).
- **Impact.** Whole-plan framing (Relationship-to-Sunrise, placement, doc/code/schema
  namespaces) was one tier off, producing a mid-execution correction that moved all docs and
  reshaped a seam design.
- **Feedback.** When the thing being planned is **itself a platform/framework that downstream
  projects fork**, the overall-plan agent should model the **full N-tier ownership up front** —
  which code/doc/schema surface each tier owns vs. reserves for its forks — rather than
  assuming a single "this fork owns everything" tier. Add an explicit "how many tiers, who
  owns/reserves what" step. **Directly relevant to the Hub**, which is itself built on Sunrise.
  _Status: open._

### A3 · Enumerate cross-boundary seams and classify each by direction; flag core→fork ones

- **Discovery.** The `f-seams` seams are **fork→core** (the fork calls _into_ a core registry —
  trivially fork-owned). The boot hook is **core→fork** (core must call _out_ to the fork) — a
  distinction the plan never drew. core→fork seams cannot be pure fork-owned; they need a
  generic upstream mechanism and carry build-time/merge constraints.
- **Impact.** The hardest design problem in `f-bootstrap` was **invisible at plan level** and
  surfaced only when the feature was designed, needing a whole conversation to resolve.
- **Feedback.** The overall-plan agent should **enumerate every cross-boundary seam** (in the
  Relationship section) and **tag each by direction**. Flag **core→fork** seams as
  sequencing/coordination risks — they imply upstream work, which the Hub-coordinated
  upstream→downstream flow needs surfaced early, not discovered at implementation. Cross-ref
  [B3] (the feature agent then designs the mechanism). _Status: open._

### A4 · Encode "gates before PR" into the working model's definition-of-done

- **Discovery.** t-1's PR was opened **before** running `/pre-pr` and `/code-review`; the human
  had to prompt for them. Some gates (full test suite, DB migration-drift) belong _before_
  opening the PR.
- **Impact.** A PR was opened in an unvalidated state; the process didn't require the gates.
- **Feedback.** The overall-plan agent owns the "How features and tasks work" / working-model
  section — it should **define the task definition-of-done to include the standard gates run
  BEFORE opening the PR**, so every feature and task inherits it. (An execution-workflow rule;
  the working model is its natural home. The feature agent mirrors it per-task — see [B4].)
  _Status: open._

### A5 · Don't track an "in-PR" task status — go straight to `done` on merge

- **Discovery.** t-1's task was flagged `in-pr` while PR #6 was open, then **stayed `in-pr`
  after the PR merged** — nobody flipped it to done (forgotten): the exact failure mode of a
  two-step terminal status.
- **Impact.** Wastes a second doc commit to flip `in-pr → done`, and — more often — the status
  goes stale because the flip is forgotten. A downside of tracking progress via GitHub PRs on a
  Markdown board, accepted for now.
- **Feedback.** The overall-plan agent owns the task status vocabulary in the working model. It
  should **omit any "PR open" state**: a promoted task goes `backlog | available | claimed → done`,
  flipped to `done` when the PR merges. One transition, nothing to forget. _Status: folded-in for
  plan.md's vocab; still open for the Hub's plan-authoring instructions._

---

## §B — Feature-plan authoring

### B1 · Sizing self-check when promoting tasks: fold commit-sized slivers

- **Discovery.** `f-bootstrap.md` promoted t-1 as its own task, but t-1 turned out
  **commit-sized** (one small real file + placeholders + empty schema); its natural PR companion
  was t-2 (the boundary that _enforces_ the skeleton it creates).
- **Impact.** One PR landed too small — below the plan's _own_ "PR not commit" resolution.
  _(Not about "done work" — the other tasks were correctly sized; this is purely the sliver.)_
- **Feedback.** When promoting indicative tasks to real ones, the feature-plan agent must run a
  **sizing self-check**: if a task's only real content is scaffolding + one small file, **fold it
  into its dependent task** and size by real changed surface. _Status: open._

### B2 · Start every feature plan with a "reconcile spec vs current repo reality" section — it worked

- **Discovery.** `f-bootstrap.md` opened with an explicit "Reconciliation with current repo
  reality" section that caught three spec-vs-reality gaps _before_ coding (fork already exists;
  docs namespace; schema prefix).
- **Impact.** Positive — surfaced corrections early instead of mid-code.
- **Feedback.** Codify "**reconcile the (possibly stale) spec against the actual repo, and record
  each adaptation as a decision**" as a **required first section of every feature plan**. The spec
  here (rev 16) predated the fork _and_ conventions Sunrise shipped later — feature plans must
  expect that gap. _Status: keep — promote to a required step._

### B3 · When a feature builds a core→fork seam, design the mechanism + spell out its constraints

- **Discovery.** Designing the boot seam required inventing the generic `initApp()` mechanism and
  discovering the build-time constraint (core can't even _name_ `@/lib/framework`, or Sunrise/
  ConQuest fail to build).
- **Impact.** Real design depth that only emerged during feature planning.
- **Feedback.** When a feature implements a seam the overall plan flagged **core→fork** ([A3]),
  the feature-plan agent must **design the generic mechanism and record its build-time/merge
  constraints as open questions** to resolve before coding — not leave "how does core reach the
  fork" implicit. _Status: open._

### B4 · Put the gates in each task's Done-when

- **Feedback.** Mirror [A4] at task granularity: each promoted task's **"Done when"** should list
  the standard gates (`/pre-pr`, then `/code-review`, green) as explicit completion criteria, so
  "task complete" provably includes them. _Status: open._

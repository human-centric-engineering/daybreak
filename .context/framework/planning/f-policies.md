---
name: f-policies
feature: 17 · f-policies
epic: Framework v1
status: in flight (dep f-facilitation-agents shipped ✅) — claim skeleton, detail to be refined in Ultraplan
owner: John
depends_on: f-facilitation-agents (shipped — #68 / #70, for the facilitation seats + `FACILITATION_ROLES` these policies gate; the per-scope guard settings f-facilitation-agents deferred land here)
spec: framework-architecture.md §5.5 (governance — the typed policy kinds) · Appendix A — F14 (governance = existing guards + supervisor/evals + audit/approvals + typed policy kinds) · F15 (escalation pathways) · F16 (policy can mandate inline guard modes per scope) · §9.2 (auto-approval risk taxonomy — deferred, ship `autoApprove: none`)
parent: plan.md
opened: 2026-07-06
---

# f-policies — typed facilitation policy kinds

> Feature-level build plan for **`f-policies`** (17). Parent:
> [[plan#17 · `f-policies` — typed facilitation policy kinds|plan.md]]. Binding _how_:
> [[framework-architecture#5.5|spec §5.5]] + Appendix A F14–F16 / §9.2. **This is a claim
> skeleton** — the board claim + intent + reconciliation targets + indicative tasks + open
> questions. The promoted-task table and the settled design decisions are refined in **Ultraplan**
> before task work begins (per [[building-a-feature]] step 1 — claim + plan lands as a standalone
> docs PR first; the detailed decisions follow). Sizing: **task = one PR** (~200–600 lines).

## Intent

Governance in the framework is mostly **reuse, not reinvention** (F14): Sunrise already ships the
inline guards, the supervisor/evaluation metrics, the approval queue, and the audit log. The **one
new piece** is **policy** — the admin-editable data that says _which governance applies where_. To
stop it becoming a junk drawer, `FacilitationPolicy` is designed as several small **typed policy
kinds** under one table (a `kind` discriminator with a **Zod-validated payload per kind**), never
one generic rules blob (F14).

This feature is the direct downstream of [[f-facilitation-agents]] (13): that feature shipped the
facilitation seats + the `FACILITATION_ROLES` vocabulary and **deferred its per-scope guard
settings here** (its dropped t-3 note) — because a per-agent guard tweak is the wrong shape; the
right shape is a typed policy kind this feature owns. The policy kinds gate _which agent roles
matter at which stage_, _what guard minimum a scope mandates_, and _how a safety signal escalates_
— data an admin edits, not logic an agent improvises.

## What ships here, and what deliberately does not

**In scope** (the board's four indicative tasks — the four policy kinds under one table):

- **`FacilitationPolicy` table + the typed-kind spine** — one table, a `kind` discriminator, a
  per-kind Zod payload, and the validate-on-write + read/resolve service. The anchor task: it
  establishes the discriminated-union pattern the other three kinds slot into.
- **Relevance/maturity gating kind** (F14 §5.5) — stage/region → allowed agent roles (+ optional
  persona switches), evaluated at conversation-routing time. The mechanism behind "which agent
  groupings matter most depends on how far the user has matured." This is the kind that consumes
  f-facilitation-agents' seats + f-engine's journey position.
- **Guard-minimums-per-scope kind** (F16) — a scope can **mandate** an inline `block` guard mode
  (in safety-critical scopes, inline-vs-post-hoc is not a latency trade-off). Reuses Sunrise's
  per-agent guard-mode machinery; the policy raises the floor.
- **Escalation-pathway kind** (F15) — signal → declarative response, **always logged**. Guards
  detect, workflows execute, hooks notify, events record — the machinery is entirely existing; the
  policy is the declarative wiring.
- **Auto-approval risk-class knob** (§9.2) — ships **`autoApprove: none`** (every structure-change
  proposal requires human sign-off). The _classification_ of which change types are safe to
  auto-approve is deferred (empirical — needs a population of real proposals; see below).

**Out of scope** (owned elsewhere / a later phase):

- **The structure-change proposal _pipeline_** (schema→invariant→risk→approval→publish) → **`f-emergence` (18)**.
  This feature ships the `autoApprove` **knob** that pipeline reads, not the pipeline.
- **New guard / supervisor / approval-queue / audit machinery** — all **reused** from Sunrise core
  (F14). This feature adds the policy _data_ that configures them, through the framework's existing
  seams; it must not fork the core governance code.
- **The policy admin UI** → **`f-ops-views` (15)** (API-first, the standing framework split — ship
  the policy APIs here, the management pages there).

## Reconciliation to do at plan time (before promoting tasks)

Follow the standing disciplines: **ship nothing a fork has to delete**, **follow the shipped code,
not the rev-16 spec sketch**, and **confirm "pure framework-tier / no upstream issue" is true at
build, not assumed** ([[planning-retro#B17|B17]]). The Ultraplan pass must nail down:

1. **Which Sunrise governance surfaces this reuses, exactly** — the inline-guard mode columns
   (F16's "per-agent guard mode columns"), the approval queue, the supervisor/evaluation metrics,
   the audit log, the hook/workflow escalation path. Name the concrete modules and confirm the
   policy layer configures them **through existing seams** (no core edit) — or, if a seam is
   missing, apply the **fork-carried core seam** pattern ([[planning-retro#B19|B19]], the #385/#403
   shape) and ledger it in [[upstream-asks]].
2. **How a policy is _resolved_ at runtime** — relevance-gating runs at conversation-routing time
   (which reaches the facilitation surface [[f-facilitation-agents]] shipped); guard-minimums must
   compose with the agent's own guard mode (policy raises the floor, never lowers it); escalation
   hangs off guard-detection. Shape the resolver to read journey position (f-engine) + seat
   (f-facilitation-agents) without threading new scope.
3. **The hand-FK discipline** for any FK to a core table (`AiAgent`, `User`) — plain scalar, no
   `@relation`, `ON DELETE` hand-written in the migration (X6/B11/B13), `--create-only`,
   `framework_*`-scoped.
4. **Sizing (B1)** — the board lists four indicative tasks (one per kind). Confirm whether the
   table-spine + first kind fold into one anchor PR, and whether guard-minimums (thin — it may be a
   column-reuse + a policy row) folds into the escalation or gating task. Don't pad to four if the
   honest shape is three.

## Indicative tasks (to be promoted in Ultraplan)

_From the board — not yet promoted. Deps, files, and the fold/split decisions are set at plan time._

- **t** — `FacilitationPolicy` table with `kind` discriminator + per-kind Zod payload; the
  validate-on-write + resolve service; **relevance/maturity gating** kind (stage/region → allowed
  roles) as the first kind proving the pattern.
- **t** — **Guard-minimums-per-scope** kind (mandate inline `block`, F16) over Sunrise's per-agent
  guard-mode machinery.
- **t** — **Escalation-pathway** kind (signal → declarative response, always logged, F15) wiring
  guards → workflows → hooks → events.
- **t** — **Auto-approval risk-class** knob (ships `none`, §9.2) — the setting `f-emergence` reads.

## Open questions — for the owner / Ultraplan

- **Auto-approval risk taxonomy** (§9.2, spec's own OPEN item). The build decision is **made**:
  ship `autoApprove: none`. What stays open — the classification of which change types are safe to
  auto-approve — is **empirical**, needs real proposals to answer, and is explicitly _not_ resolved
  hypothetically. Ship the knob at `none`; revisit once `f-emergence`'s pipeline has operating
  history.
- **Table-per-kind vs one-table-with-discriminator** — the spec is emphatic: **one table, typed
  kinds** (not a junk-drawer blob, not a table per kind). Confirm the discriminated-union Zod shape
  at plan time; this is the anchor decision.
- **Where relevance-gating evaluates** — conversation-routing time is named, but confirm the exact
  hook against the facilitation surface + module surface without a new scope thread.

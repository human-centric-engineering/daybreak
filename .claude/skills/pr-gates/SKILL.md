---
name: pr-gates
description: |
  Runs the full pre-merge gate suite on the current branch — /pre-pr, /test-coverage,
  /security-review, and /code-review — back-to-back and autonomously fixes what it
  finds, looping until every gate is clean (a fixed point) or a fix needs a human
  decision. Use when the user wants to "run the gates", "get this branch ready to
  merge/PR", "run pre-pr + security + code review", or asks to green-light a branch
  before opening a pull request. It fixes issues in the working tree; it does NOT
  commit, push, or open the PR unless separately asked.
---

# pr-gates — autonomous pre-merge gate runner

Run the four pre-merge gates on the current branch, address findings as you go, and
re-run until the whole suite passes cleanly. The goal is a **branch that is green on
every gate**, reached with minimal back-and-forth — you drive the fixes yourself and
only stop to ask when a decision is genuinely the user's.

## What it runs (in this order — the order matters)

1. **`/pre-pr`** — deterministic checklist: `npm run validate` (type-check + lint +
   format), `npm run test:coverage`, migration-drift, anti-pattern scan, changed-file
   coverage, CHANGELOG/public-surface check. **Nothing else is worth reviewing until
   this is green** — a diff that doesn't compile or passes lint can't be meaningfully
   security- or code-reviewed.
2. **`/test-coverage branch`** — coverage gaps on the branch diff. Findings become
   test-writing work.
3. **`/security-review`** — security pass over the pending diff.
4. **`/code-review`** — correctness bugs + reuse/simplification/efficiency on the diff.

Rationale for the order: cheap-and-deterministic → coverage → semantic reviews.
Every semantic-review fix changes code, so the loop below sends you back through the
deterministic gate to prove the fix didn't regress anything.

`$ARGUMENTS` (optional): a subset of gate names to run (e.g. `pre-pr code-review`) —
default is all four; and/or a code-review effort level (`low|medium|high|max`,
default `high`). Ignore tokens you don't recognise.

## Operating principles — read before you start

- **Fixed-point convergence, not one-shot.** After you apply any fix, the gates that
  could be affected must be re-run. You are done only when a **full pass produces zero
  new actionable findings**. Loop; don't declare victory after the first sweep.
- **Autonomously fix the clear-cut; escalate the judgment calls.** Apply fixes
  yourself for: type/lint/format errors, failing tests you can correct without
  changing intended behaviour, missing tests for changed code, mechanical anti-pattern
  violations (`console` → `logger`, relative → `@/` imports, missing auth guard on a
  new route, missing `onDelete` policy, un-validated boundary input), a missing
  CHANGELOG entry, and any `/code-review` finding with an unambiguous correct fix.
  **Stop and ask** (via AskUserQuestion, batched) when a finding: changes intended
  behaviour or product scope; is a security finding whose remedy is a design decision
  (auth model, data exposure, crypto choice); is a coverage/quality gap the user may
  consciously accept; or is contested/uncertain enough that guessing risks the wrong
  fix.
- **Respect the fork boundary.** This is Daybreak (see the CLAUDE.md banner). If
  satisfying a finding would require editing a **Sunrise-owned** file (core `lib/`,
  core `app/api/v1`, security middleware, `lib/sunrise-version.ts`, etc.) or the
  reserved empty `lib/app/*` / `app.prisma` leaf surface, **do not** — surface it to
  the user with the seam-based alternative instead. Fix through the seams; never
  introduce a merge conflict to pass a gate.
- **Never commit, push, or open the PR.** You mutate the working tree only. Committing
  and PR creation are the user's call (repo convention). Report the final state and let
  them take it from there.
- **Keep fixes inside the branch's intent.** Do not refactor unrelated code, add
  features, or expand scope to satisfy a "nice to have" finding — note it instead.

## The convergence loop

```
pass = 0
loop:
  pass += 1
  run each selected gate in order (1→4)
  collect findings, split into { auto-fixable, needs-human }
  if auto-fixable is empty and needs-human is empty:
      → CONVERGED — go to Final report
  apply every auto-fixable finding
  if any code changed:
      re-run /pre-pr (validate + tests) to prove no regression; fold new failures in
  if needs-human is non-empty:
      → batch them into ONE AskUserQuestion, get decisions, apply, continue
  if pass reaches the cap → stop and report what remains (see caps)
```

**Caps (runaway guard).** At most **3 full passes**. Within a single gate, at most **2
fix rounds** before you escalate that gate's residue to the user. If a fix oscillates
(the same finding reappears after being "fixed"), stop fixing it and escalate — a loop
means the fix is wrong or the finding is a false positive worth a human's eye. Always
`log`/report when you hit a cap; a silent cap reads as "all clear" when it isn't.

## Running each gate

Invoke each via the Skill tool, then act on its output:

- **`/pre-pr`** — if `npm run validate` or `test:coverage` fails, fix and re-run before
  going further (per its own Step 1 "stop" rule). Address anti-pattern hits and the
  changed-file coverage shortfall (<80%) by editing code / adding tests. If it flags a
  missing CHANGELOG entry, add one **only if the diff truly touches the public surface**
  (named seam, documented API, published Prisma model) — and remember on Daybreak the
  CHANGELOG is Sunrise-owned, so a framework-tier change generally needs **no** entry;
  when unsure, escalate rather than edit a Sunrise-owned file.
- **`/test-coverage branch`** — for each under-covered changed file, write tests.
  Prefer delegating to the **test-engineer** agent (or `/test-write`) for anything
  beyond a couple of cases, so the tests follow `.context/testing/` patterns and the
  anti-green-bar rule (assert what the code _does_, not what mocks return). Re-run to
  confirm the gap closed.
- **`/security-review`** — apply clear remediations (input validation, output
  escaping, authz guard, secret handling). Escalate anything that is a design decision
  or would touch Sunrise-owned security middleware.
- **`/code-review`** — run at the requested effort (default `high`). You may pass
  `--fix` to let it apply its own findings, then re-run `/pre-pr` to confirm the
  applied fixes are green; or apply them yourself when you want tighter control.
  Escalate findings marked uncertain/low-confidence rather than force a guess.

## Final report

End with a compact, scannable summary — one block per gate:

- **Gate** · final status: ✅ clean · 🔧 fixed (N issues) · 🙋 needs-human (N)
- **What was changed** — bullet the fixes applied (file · one-line what/why)
- **What remains** — anything escalated or consciously deferred, with why
- **Branch state** — confirm working tree is modified-but-uncommitted, and name the
  next step (`/pre-pr` clean → ready to commit + open PR), which is the user's to take.

If the suite converged clean with no human input needed, say so plainly in one line and
still list what was fixed along the way.

## Notes

- This orchestrates the branch-diff gates; it does not open a PR or post PR comments.
  For the deep cloud review, `/code-review ultra` remains a separate, user-triggered
  step.
- For a _time-based_ continuous run (e.g. re-gate every N minutes while you keep
  working), wrap this in `/loop` — but the default and normal use is the fixed-point
  convergence above, which ends when the branch is green.

# Upstream asks — Daybreak → Sunrise

Fork-first seams Daybreak built ahead of (or composing with) a Sunrise seam that
hasn't landed yet. On every Sunrise pull ([`CUSTOMIZATION.md` §9](../../CUSTOMIZATION.md)),
check each **open** row: if its upstream issue has landed, **delegate to the
upstream resolver and delete the fork shim**, then close the row. This is the
"delegate when it lands" trigger that would otherwise be lost in feature-plan prose.

**This is not a boundary-breach log.** A _breach_ is editing a Sunrise-owned file
because no seam exists (the [`CLAUDE.md`](../../CLAUDE.md) banner's "keep the edit
minimal and add a follow-up" case) — those get a `keep-mine` follow-up, not a row
here. This ledger is the _sanctioned_ fork-first case: the code is clean
framework-tier, but its final home is an upstream seam. See
[`planning/planning-retro.md` B5/B7](./planning/planning-retro.md) for the
fork-first-informs-upstream working model this indexes, and the feature plans /
[`plan.md` Work-completed log](./planning/plan.md) for the narrative each row
summarises.

## The ledger

| Daybreak seam                                                                                         | Composes with                                                                                                                                                                                                                              | Feature                                               | Delegate-when-it-lands action                                                                                                                                                                                                                                  | Status                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`lib/framework/shared/access.ts`](../../lib/framework/shared/access.ts) — `canRead` / `subjectScope` | Sunrise [#367](https://github.com/human-centric-engineering/sunrise/issues/367) (intra-tenant ownership scope) · [#366](https://github.com/human-centric-engineering/sunrise/issues/366) (org-admin / tier axis, carried via `scope.tier`) | [f-journey-state (09)](./planning/f-journey-state.md) | Replace the self-read + explicit admin-support body with a call to the upstream ownership resolver, passing `scope`; drop the fork-local `JourneyViewer` / `AccessScope` types if the resolver supplies them; keep the `canRead` ⇔ `subjectScope` parity test. | **open** — fork-note to file on #367 |

## Adding a row

When a feature builds a seam whose final home is an upstream Sunrise seam:

1. Add a row here (seam file, upstream issue(s), owning feature, the concrete
   delegate action, status).
2. File / update the fork-perspective note on the existing Sunrise issue as the
   feature's own Done-when deliverable (retro B7) — a **new** issue only if none
   already tracks the seam.
3. Close the row on the Sunrise pull that lands the seam, once the shim is deleted
   and callers delegate.

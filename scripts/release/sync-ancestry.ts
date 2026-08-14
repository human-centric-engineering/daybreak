/**
 * Sync-ancestry guard logic (Sunrise #539) — pure, unit-tested, no I/O.
 *
 * Decides whether the fork's git history actually contains the Sunrise release
 * it claims to be on. The CLI wrapper (`scripts/release/sync-ancestry-check.ts`)
 * supplies the facts from git and does the exiting.
 *
 * # The failure this catches
 *
 * A fork adopts a Sunrise release with `git merge vX.Y.Z`, which records the
 * release as a second parent. That merge commit is the *only* thing telling git
 * where the fork and upstream last agreed. **Squash-merge the sync PR and the
 * second parent is gone**: the tree still has every upstream change, and
 * `lib/sunrise-version.ts` still says the new version, but the merge base
 * silently reverts to the release before it. Nothing errors. Nothing logs.
 *
 * The bill arrives at the *next* sync, which replays the whole preceding range
 * and conflicts on files that already carry the change — and by then the cause
 * is months of history away. Daybreak paid this on the v0.8.1 sync (PR #196).
 *
 * # Why this checks the CLAIMED version, not the latest upstream tag
 *
 * Sunrise #539 proposes `git merge-base --is-ancestor <latest sunrise tag> HEAD`.
 * That over-fires: being behind the newest release is the normal state of a fork
 * — you adopt releases when you choose to, not the moment they are cut — so the
 * guard would sit red for a non-problem and get ignored, which is the worst thing
 * a guard can be.
 *
 * What must hold unconditionally is narrower and sharper: **the version this tree
 * claims must be in this tree's history.** `SUNRISE_VERSION` is an assertion about
 * ancestry; this checks it. Being behind upstream is fine and stays silent; lying
 * about where you are is not.
 *
 * # Why "tag missing" passes
 *
 * A clone with no `upstream` remote has none of Sunrise's tags, and CI checkouts
 * are frequently shallow. Failing there would punish a configuration problem
 * rather than the defect, and would train people to bypass the guard. It skips
 * loudly instead — the reason is printed, so a silent CI skip is never mistaken
 * for a clean run. Same posture as the changelog guard's shallow-clone branch.
 */

/** What the CLI observed from git and the version constant. */
export interface SyncAncestryFacts {
  /** The version `lib/sunrise-version.ts` claims (e.g. `'0.8.1'`). */
  claimedVersion: string;
  /** The tag name the claim resolves to (e.g. `'v0.8.1'`). */
  tag: string;
  /** Whether that tag exists in this clone. `false` ⇒ nothing to check against. */
  tagExists: boolean;
  /** Whether the tag is an ancestor of HEAD. Meaningless when `tagExists` is false. */
  isAncestor: boolean;
}

export type SyncAncestryOutcome = 'ok' | 'skipped' | 'violation';

export interface SyncAncestryVerdict {
  outcome: SyncAncestryOutcome;
  /** One-line summary for the log. */
  summary: string;
}

/** The tag name Daybreak expects for a given Sunrise version. */
export function sunriseTagFor(version: string): string {
  return `v${version}`;
}

/**
 * Whether a thrown `git merge-base --is-ancestor` error means **"not an
 * ancestor"** rather than a genuine git failure.
 *
 * That command signals its answer through the exit code — 0 yes, 1 no — so the
 * "no" arrives as a thrown error from `execFileSync`, which throws on any
 * non-zero status. Treating every throw as "no" would make a real git failure
 * (128: not a git repository, bad object, corrupt index) indistinguishable from
 * a clean negative, and the guard would fail the build claiming a broken merge
 * base when git simply could not run. Only status 1 is an answer; everything
 * else must propagate.
 *
 * Lives here rather than in the CLI so the distinction is testable without
 * mocking `execFileSync` — the subtlety is in the classification, not the I/O.
 */
export function isNotAncestorExit(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { status?: unknown }).status === 1;
}

/**
 * The verdict for a set of observed facts.
 *
 * Three outcomes, deliberately distinct: `ok` (the claim is backed by history),
 * `skipped` (the guard could not be evaluated — passes, but says so), and
 * `violation` (the tree claims a release its history does not contain).
 */
export function checkSyncAncestry(facts: SyncAncestryFacts): SyncAncestryVerdict {
  if (!facts.tagExists) {
    return {
      outcome: 'skipped',
      summary:
        `cannot verify: tag ${facts.tag} is not in this clone ` +
        '(no upstream remote, or tags not fetched) — guard not evaluated',
    };
  }

  if (facts.isAncestor) {
    return {
      outcome: 'ok',
      summary: `Sunrise ${facts.claimedVersion} is in this history (${facts.tag} is an ancestor of HEAD)`,
    };
  }

  return {
    outcome: 'violation',
    summary: `Sunrise ${facts.claimedVersion} is claimed but ${facts.tag} is NOT an ancestor of HEAD`,
  };
}

/** The remediation text shown on a violation. */
export function formatSyncAncestryVerdict(facts: SyncAncestryFacts): string {
  return [
    `  FAIL  sync ancestry: lib/sunrise-version.ts claims Sunrise ${facts.claimedVersion},`,
    `        but ${facts.tag} is not an ancestor of HEAD — the merge base with upstream`,
    '        has been reset, almost certainly by a SQUASH-MERGED sync PR.',
    '',
    '        The tree content is probably fine; it is the ancestry that is missing,',
    '        and the cost lands on the NEXT sync, which will replay the whole',
    '        preceding range and conflict on changes already present.',
    '',
    '        To repair — verify first, because -s ours swallows anything genuinely missing:',
    '',
    `          git fetch upstream --tags`,
    `          git diff --name-only <previous-tag> ${facts.tag}   # what the release touched`,
    `          git diff <previous-tag> HEAD -- <those files>      # confirm it is all present`,
    `          git merge -s ours ${facts.tag}                     # record ancestry, tree untouched`,
    '',
    '        To prevent — merge sync PRs with a MERGE COMMIT, never squash.',
    '        See CUSTOMIZATION.md §9.',
  ].join('\n');
}

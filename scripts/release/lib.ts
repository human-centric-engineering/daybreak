/**
 * Changelog-guard logic (f-release t-3) — pure, unit-tested, no I/O.
 *
 * Decides whether a set of changed files requires an entry in Daybreak's
 * changelog. The CLI wrapper (`scripts/release/changelog-check.ts`) supplies the
 * file list from git and does the exiting.
 *
 * # Why a gate at all
 *
 * `.context/framework/CHANGELOG.md` is what a leaf fork reads before merging a
 * Daybreak release. Its value is entirely in being complete — a changelog that
 * omits the one change that breaks you is worse than none, because you trusted it.
 * Conventions alone decay; the Sunrise v0.8.0 sync is the proof, where a
 * leaf-contract change (`lib/app/data-export.ts` changing hands) would have
 * reached a leaf with no announcement at all.
 *
 * # Why the gated set is NARROWER than the documented public surface
 *
 * `VERSIONING.md` defines the public surface to include "exported values from
 * `lib/framework/**` that a leaf is documented to call". That is not
 * mechanically detectable — a path cannot tell you whether an export is
 * documented — so gating all of `lib/framework/**` would fire on every internal
 * refactor. A gate that cries wolf gets bypassed, and then it protects nothing.
 *
 * So this guard covers the **high-signal, mechanically-decidable** subset:
 *
 *   - the `lib/app/*` seam files (a file changing hands is THE change that
 *     breaks a leaf, and it is exactly what 0.1.0 had to announce)
 *   - `prisma/schema/framework-*.prisma` (published model shapes)
 *   - `lib/daybreak-version.ts` (the version contract itself)
 *
 * The rest of the public surface relies on the written rule plus review. This is
 * a deliberate floor, not the whole ceiling — documented here so nobody later
 * mistakes the gate's silence for "no changelog needed".
 */

/** The changelog a public-surface change must touch. */
export const CHANGELOG_PATH = '.context/framework/CHANGELOG.md';

/**
 * Path patterns that constitute a mechanically-detectable public-surface change.
 * Each carries the reason it is here, which is surfaced in the failure message —
 * an error that says WHICH file tripped it and WHY is actionable; "add a
 * changelog entry" alone is not.
 */
export const GATED_SURFACE: ReadonlyArray<{ test: (path: string) => boolean; reason: string }> = [
  {
    // `lib/app/<name>.ts` only — not nested paths, which are a leaf's own code.
    test: (p) => /^lib\/app\/[^/]+\.(ts|mjs)$/.test(p),
    reason:
      'a lib/app/* seam changed — which files are Daybreak-owned vs leaf-reserved is itself public surface, and a file changing hands breaks any leaf that filled it',
  },
  {
    test: (p) => /^prisma\/schema\/framework-[^/]+\.prisma$/.test(p),
    reason: 'a framework_* model shape changed — leaves read these tables',
  },
  {
    test: (p) => p === 'lib/daybreak-version.ts',
    reason: 'the Daybreak version constant changed',
  },
];

/** Paths that never require an entry, even when they match a rule above. */
function isExempt(path: string): boolean {
  // Tests and docs cannot change a leaf's contract on their own. `.context/`
  // includes the changelog itself, so exempting it also stops a docs-only PR
  // that edits the changelog from being asked to edit the changelog.
  return path.startsWith('tests/') || path.startsWith('.context/');
}

export interface ChangelogVerdict {
  /** True when the change requires an entry and none was made. */
  violation: boolean;
  /** The gated files that triggered the requirement, with their reasons. */
  triggers: { path: string; reason: string }[];
  /** True when the changelog was touched. */
  changelogTouched: boolean;
}

/**
 * Decide whether `changedFiles` needs a changelog entry it does not have.
 *
 * Pure: give it a list of repo-relative paths, get a verdict. No git, no fs.
 */
export function checkChangelog(changedFiles: readonly string[]): ChangelogVerdict {
  const changelogTouched = changedFiles.includes(CHANGELOG_PATH);

  const triggers = changedFiles
    .filter((path) => !isExempt(path))
    .flatMap((path) => {
      const rule = GATED_SURFACE.find((r) => r.test(path));
      return rule ? [{ path, reason: rule.reason }] : [];
    });

  return {
    violation: triggers.length > 0 && !changelogTouched,
    triggers,
    changelogTouched,
  };
}

/** Render a verdict as the message CI prints. Separated so it is testable. */
export function formatVerdict(verdict: ChangelogVerdict): string {
  const lines = [
    `Public-surface change with no entry in ${CHANGELOG_PATH}.`,
    '',
    'Triggered by:',
    ...verdict.triggers.map((t) => `  • ${t.path}\n      ${t.reason}`),
    '',
    `Add an entry under "## [Unreleased]" describing what a LEAF fork must do about`,
    `this change — or, if it genuinely does not affect them, say so in the PR.`,
    `Contract: .context/framework/VERSIONING.md`,
  ];
  return lines.join('\n');
}

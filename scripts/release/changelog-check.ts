/**
 * Daybreak changelog guard (f-release t-3) — CLI wrapper.
 *
 * Fails (exit 1) when a branch changes Daybreak's mechanically-detectable public
 * surface without touching `.context/framework/CHANGELOG.md`. The decision logic
 * is pure and unit-tested in `scripts/release/lib.ts`; this file only does git
 * I/O and exiting.
 *
 * Runs in CI via `npm run app:ci-checks` — Sunrise's **fork-owned** CI seam, which
 * is why this needs no edit to any Sunrise file and survives upstream syncs.
 *
 * **It evaluates COMMITTED state** (`merge-base...HEAD`), which is what CI sees.
 * Running it locally with the changelog edit still unstaged therefore reports a
 * violation — correctly, since that is exactly what would be pushed. Commit, then
 * re-run. Deliberately not extended to read the working tree: a guard whose
 * verdict differs between your machine and CI is worse than one that is strict.
 *
 * Usage: `npm run framework:changelog`
 */

import { execFileSync } from 'node:child_process';
import { logger } from '@/lib/logging';
import { checkChangelog, formatVerdict, CHANGELOG_PATH } from '@/scripts/release/lib';

/** The base ref to diff against. CI sets it; locally we fall back to origin/main. */
const BASE_REF = process.env.CHANGELOG_BASE_REF ?? 'origin/main';

/**
 * Files changed on this branch relative to the merge-base with `BASE_REF`.
 *
 * Returns `null` — meaning "cannot determine" — rather than an empty list when
 * git can't answer (a shallow clone with no merge-base, a detached checkout, a
 * fresh repo). An empty list would read as "nothing changed" and pass the guard
 * silently, which is the one failure mode a guard must not have.
 */
function changedFiles(): string[] | null {
  try {
    const mergeBase = execFileSync('git', ['merge-base', BASE_REF, 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const out = execFileSync('git', ['diff', '--name-only', `${mergeBase}...HEAD`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function main(): void {
  logger.info('Daybreak changelog guard (f-release t-3)...');

  const files = changedFiles();

  if (files === null) {
    // Skip, loudly, and pass. A developer running this on a branch with no
    // merge-base should not be blocked, but the reason is printed so a silent
    // CI skip is never mistaken for a clean run.
    logger.warn(
      `  SKIP  cannot determine changed files against ${BASE_REF} ` +
        '(shallow clone or missing ref) — guard not evaluated.'
    );
    process.exit(0);
  }

  const verdict = checkChangelog(files);

  if (!verdict.violation) {
    const detail = verdict.triggers.length
      ? `${verdict.triggers.length} public-surface file(s) changed, ${CHANGELOG_PATH} updated`
      : 'no public-surface change';
    logger.info(`  OK    Daybreak changelog: ${detail}.`);
    process.exit(0);
  }

  logger.error(formatVerdict(verdict));
  process.exit(1);
}

main();

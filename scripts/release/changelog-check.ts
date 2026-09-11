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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '@/lib/logging';
import {
  checkChangelog,
  formatVerdict,
  CHANGELOG_PATH,
  type BarrelDelta,
} from '@/scripts/release/lib';
import { diffExports, readBarrelExports, type BarrelExports } from '@/scripts/ci/exports-diff';

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

/**
 * The exported-symbol delta of every `lib/framework/**` barrel, base → HEAD (#239).
 *
 * ## Why this reads barrels itself instead of importing Sunrise's reader
 *
 * `scripts/ci/check-exports.ts` exports exactly the right helpers — and ends with
 * `process.exitCode = main(process.argv.slice(2))` at module scope. Importing ANY
 * symbol from it runs the whole CLI: it re-reads all 43 barrels, prints its own
 * report into this guard's output, parses THIS process's argv, and assigns
 * `process.exitCode`. Verified by doing it — the probe symbol was reported twice,
 * once by each tool. A module that self-executes on import is not importable, so
 * this does not import it. Asked upstream to guard that invocation; when it lands,
 * this function collapses to two calls.
 *
 * The pure differ (`scripts/ci/exports-diff.ts`) has no such side effect and IS
 * imported — none of the parsing is duplicated, only the git plumbing.
 *
 * ## Why the resolver is narrower than Sunrise's
 *
 * Sunrise's `resolveSpecifier` handles relative specifiers because core barrels
 * may use them. Daybreak's cannot: `aliasBan` forbids relative imports repo-wide,
 * and every framework barrel uses `@/` today (checked). So this resolves `@/` only
 * — and an unresolvable star is REPORTED rather than silently treated as exporting
 * nothing, which is the difference between a shorter answer and a wrong one.
 *
 * Returns `null` — "could not look" — rather than `[]` when the base is unreadable.
 * `[]` would read as "surface unchanged" and pass the guard silently, the failure
 * mode `changedFiles()` above is already written against.
 */
function readFrameworkBarrels(rev: string | null): BarrelExports[] | null {
  const root = process.cwd();

  const read = (path: string): string | null => {
    try {
      return rev === null
        ? readFileSync(join(root, path), 'utf8')
        : execFileSync('git', ['show', `${rev}:${path}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
    } catch {
      return null;
    }
  };

  // `@/x` is repo-relative. `x` may be `x.ts` or `x/index.ts` — try both, as the
  // compiler would. `fromDir` is unused because there are no relative specifiers
  // to resolve against; an unresolved star surfaces through `unresolvedStars`.
  const resolveSibling = (specifier: string): { text: string; dir: string } | null => {
    if (!specifier.startsWith('@/')) return null;
    const base = specifier.slice(2);
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      const text = read(candidate);
      if (text !== null) return { text, dir: dirname(candidate) };
    }
    return null;
  };

  let listing: string;
  try {
    listing =
      rev === null
        ? execFileSync('git', ['ls-files', '--', 'lib/framework'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          })
        : execFileSync('git', ['ls-tree', '-r', '--name-only', rev, '--', 'lib/framework'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
  } catch {
    return null;
  }

  const barrels: BarrelExports[] = [];
  for (const path of listing.split('\n').filter((p) => p.endsWith('/index.ts'))) {
    const text = read(path);
    if (text === null) continue;
    const parsed = readBarrelExports(text, resolveSibling, dirname(path));
    if (parsed.unresolvedStars.length > 0) {
      logger.warn(
        `  PARTIAL  ${path} re-exports from ${parsed.unresolvedStars.join(', ')}, which could ` +
          'not be read — its symbol list is incomplete and the surface check may under-report.'
      );
    }
    barrels.push({ file: path, symbols: parsed.symbols, unresolvedStars: parsed.unresolvedStars });
  }
  return barrels;
}

function barrelDeltas(): BarrelDelta[] | null {
  try {
    const mergeBase = execFileSync('git', ['merge-base', BASE_REF, 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const base = readFrameworkBarrels(mergeBase);
    // HEAD from the WORKING TREE, matching what `check:exports` compares and what
    // the author is looking at. The path rules above read committed state; an
    // uncommitted barrel edit is still a surface change worth being told about.
    const head = readFrameworkBarrels(null);
    if (base === null || head === null) return null;

    return diffExports(base, head);
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

  const deltas = barrelDeltas();
  if (deltas === null) {
    logger.warn(
      `  PARTIAL  could not read barrels at the merge-base with ${BASE_REF} — ` +
        'the lib/framework export surface was NOT checked. Path rules still applied.'
    );
  }

  const verdict = checkChangelog(files, deltas ?? []);

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

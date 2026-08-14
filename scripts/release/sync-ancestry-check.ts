/**
 * Sync-ancestry guard (Sunrise #539) — CLI wrapper.
 *
 * Fails (exit 1) when `lib/sunrise-version.ts` claims a Sunrise release that is
 * not in this tree's git history — the signature of a squash-merged sync PR,
 * which drops the merge commit that records where the fork and upstream last
 * agreed. The decision logic is pure and unit-tested in
 * `scripts/release/sync-ancestry.ts`; this file only does git I/O and exiting.
 *
 * Runs in CI via `npm run app:ci-checks` — Sunrise's **fork-owned** CI seam, which
 * is why this needs no edit to any Sunrise file and survives upstream syncs.
 *
 * Usage: `npm run framework:sync-ancestry`
 */

import { execFileSync } from 'node:child_process';
import { logger } from '@/lib/logging';
import { SUNRISE_VERSION } from '@/lib/sunrise-version';
import {
  checkSyncAncestry,
  formatSyncAncestryVerdict,
  sunriseTagFor,
  type SyncAncestryFacts,
} from '@/scripts/release/sync-ancestry';

/** True when `ref` resolves to an object in this clone. */
function refExists(ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * True when `ref` is an ancestor of HEAD.
 *
 * `--is-ancestor` signals its answer through the exit code: 0 yes, 1 no, and
 * anything else is a real error. `execFileSync` throws on all non-zero, so a
 * genuine git failure would otherwise read as a clean "no" and fail the build for
 * the wrong reason — hence the explicit status check before returning `false`.
 */
function isAncestorOfHead(ref: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return false;
    throw error;
  }
}

function main(): void {
  logger.info('Daybreak sync-ancestry guard (Sunrise #539)...');

  const tag = sunriseTagFor(SUNRISE_VERSION);
  const tagExists = refExists(tag);

  const facts: SyncAncestryFacts = {
    claimedVersion: SUNRISE_VERSION,
    tag,
    tagExists,
    isAncestor: tagExists ? isAncestorOfHead(tag) : false,
  };

  const verdict = checkSyncAncestry(facts);

  if (verdict.outcome === 'ok') {
    logger.info(`  OK    sync ancestry: ${verdict.summary}.`);
    process.exit(0);
  }

  if (verdict.outcome === 'skipped') {
    logger.warn(`  SKIP  sync ancestry: ${verdict.summary}.`);
    process.exit(0);
  }

  logger.error(formatSyncAncestryVerdict(facts));
  process.exit(1);
}

main();

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
  isNotAncestorExit,
  planIsNoop,
  planRefBootstrap,
  sunriseTagFor,
  SUNRISE_CLONE_URL,
  UPSTREAM_REMOTE,
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
 * `--is-ancestor` signals its answer through the exit code, so the "no" arrives
 * as a thrown error. `isNotAncestorExit` decides which throws are answers and
 * which are genuine git failures worth propagating — see its doc comment.
 */
function isAncestorOfHead(ref: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (error) {
    if (isNotAncestorExit(error)) return false;
    throw error;
  }
}

/** `git` with output discarded; throws on non-zero like every other call here. */
function git(...args: string[]): void {
  execFileSync('git', args, { stdio: ['ignore', 'ignore', 'ignore'] });
}

/** True when this clone was fetched with a truncated history (CI's default). */
function isShallowClone(): boolean {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

/** True when a remote of that name is configured. */
function hasRemote(name: string): boolean {
  try {
    execFileSync('git', ['remote', 'get-url', name], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch the refs the check needs, if they are not already here.
 *
 * Returns `false` when the refs could not be obtained (offline runner, blocked
 * egress, no such remote) so the caller can skip loudly rather than accuse the
 * tree of a violation it could not actually observe. Network failure is an
 * environment problem, exactly like a missing tag.
 *
 * A no-op on a maintainer's machine that already has the tags and full history,
 * so the usual local run costs nothing and touches no git config.
 */
function ensureRefs(tag: string): boolean {
  const plan = planRefBootstrap({
    tagResolvable: refExists(tag),
    isShallow: isShallowClone(),
    hasUpstreamRemote: hasRemote(UPSTREAM_REMOTE),
  });

  if (planIsNoop(plan)) return true;

  try {
    if (plan.unshallow) {
      // Depth-1 HEAD has no parents, so --is-ancestor would answer "no" to
      // everything. Deepen before any negative can be believed.
      logger.info('  ...  shallow clone — deepening history so ancestry is answerable');
      git('fetch', '--unshallow', '--quiet');
    }
    if (plan.addRemote) {
      logger.info(`  ...  adding the ${UPSTREAM_REMOTE} remote (${SUNRISE_CLONE_URL})`);
      git('remote', 'add', UPSTREAM_REMOTE, SUNRISE_CLONE_URL);
    }
    if (plan.fetchTags) {
      logger.info(`  ...  fetching Sunrise tags from ${UPSTREAM_REMOTE}`);
      git('fetch', UPSTREAM_REMOTE, '--tags', '--quiet');
    }
    return true;
  } catch (error) {
    logger.warn('  ...  could not fetch the Sunrise refs — the guard will skip', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function main(): void {
  logger.info('Daybreak sync-ancestry guard (Sunrise #539)...');

  const tag = sunriseTagFor(SUNRISE_VERSION);
  ensureRefs(tag);
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

/**
 * A git failure is a SKIP, not a violation.
 *
 * `isAncestorOfHead` deliberately rethrows anything that is not a clean "no"
 * (status 128: not a git repository, bad object, missing binary). Without this
 * handler that would leave the CI step with a raw stack trace and exit 1 — the
 * same signal as a real merge-base violation, but with no diagnosis and the wrong
 * cause. That contradicts the missing-tag posture a few lines above: an
 * environment the guard cannot evaluate must be reported loudly and passed, never
 * reported as the defect it was unable to look for.
 */
try {
  main();
} catch (error) {
  logger.warn(
    '  SKIP  sync ancestry: git could not be queried — guard not evaluated. ' +
      'This is an environment problem, not a merge-base violation.',
    { error: error instanceof Error ? error.message : String(error) }
  );
  process.exit(0);
}

/**
 * Tests: scripts/release/sync-ancestry.ts — the #539 guard's decision logic.
 *
 * Pure over observed facts; no git, no fs. The three outcomes are deliberately
 * distinct, and the cases that matter are a guard's two failure modes: firing
 * when it shouldn't (which trains people to bypass it) and staying silent when
 * it should fire (which is the gap it exists to close).
 *
 * @see scripts/release/sync-ancestry.ts · CUSTOMIZATION.md §9
 */

import { describe, it, expect } from 'vitest';
import {
  checkSyncAncestry,
  formatSyncAncestryVerdict,
  isNotAncestorExit,
  planIsNoop,
  planRefBootstrap,
  sunriseTagFor,
  type RepoRefState,
  type SyncAncestryFacts,
} from '@/scripts/release/sync-ancestry';

const facts = (overrides: Partial<SyncAncestryFacts> = {}): SyncAncestryFacts => ({
  claimedVersion: '0.8.1',
  tag: 'v0.8.1',
  tagExists: true,
  isAncestor: true,
  ...overrides,
});

describe('sunriseTagFor', () => {
  it('prefixes the version with v, matching how Sunrise tags releases', () => {
    expect(sunriseTagFor('0.8.1')).toBe('v0.8.1');
  });

  it('does NOT use the daybreak- prefix — Sunrise tags are bare vX.Y.Z', () => {
    // Daybreak's OWN releases are `daybreak-v0.1.0`, precisely so they don't
    // collide with the Sunrise tags in the same clone. This guard checks the
    // Sunrise side, so it must resolve the bare form.
    expect(sunriseTagFor('0.1.0')).not.toContain('daybreak');
  });
});

describe('checkSyncAncestry', () => {
  it('passes when the claimed release is in the history', () => {
    const verdict = checkSyncAncestry(facts());

    expect(verdict.outcome).toBe('ok');
    expect(verdict.summary).toContain('is in this history');
  });

  it('fires when the tree claims a release its history does not contain', () => {
    // The squash-merged sync PR: content landed, ancestry did not.
    const verdict = checkSyncAncestry(facts({ isAncestor: false }));

    expect(verdict.outcome).toBe('violation');
    expect(verdict.summary).toContain('NOT an ancestor');
  });

  it('skips — rather than fails — when the tag is not in the clone', () => {
    // No upstream remote or unfetched tags is a configuration problem, not the
    // defect. Failing here would punish the wrong thing and train people to
    // bypass the guard.
    const verdict = checkSyncAncestry(facts({ tagExists: false }));

    expect(verdict.outcome).toBe('skipped');
    expect(verdict.summary).toContain('not in this clone');
  });

  it('skips on a missing tag even when isAncestor is stale-true', () => {
    // `isAncestor` is meaningless without the tag; the CLI passes `false`, but
    // the verdict must not depend on that convention holding.
    const verdict = checkSyncAncestry(facts({ tagExists: false, isAncestor: true }));

    expect(verdict.outcome).toBe('skipped');
  });

  it('stays silent about being BEHIND upstream — that is the normal fork state', () => {
    // A fork on 0.8.1 while Sunrise has cut 0.9.0 is not a defect. The guard
    // checks the claim against history, never the claim against latest, which
    // is why it can sit in CI without going permanently red.
    const verdict = checkSyncAncestry(facts({ claimedVersion: '0.8.1', isAncestor: true }));

    expect(verdict.outcome).toBe('ok');
  });
});

describe('formatSyncAncestryVerdict', () => {
  it('names the squash-merge cause and the repair, not just the symptom', () => {
    const message = formatSyncAncestryVerdict(facts({ isAncestor: false }));

    expect(message).toContain('SQUASH-MERGED');
    expect(message).toContain('git merge -s ours v0.8.1');
    expect(message).toContain('CUSTOMIZATION.md §9');
  });

  it('tells the reader to verify content BEFORE recording ancestry', () => {
    // -s ours silently swallows anything genuinely missing, so the remediation
    // is unsafe without the diff step. A guard that prescribes a dangerous fix
    // is worse than one that only reports.
    const message = formatSyncAncestryVerdict(facts({ isAncestor: false }));

    expect(message).toContain('verify first');
    expect(message).toContain('confirm each one landed');
  });

  it('verifies content by diffing FROM THE TAG, not from the previous tag', () => {
    // The check must answer "did THIS release's content land". A
    // <previous-tag>..HEAD diff is dominated by the fork's own commits, so it
    // looks plausible while upstream content is missing — and the very next
    // line tells you to run `merge -s ours`, permanently recording ancestry for
    // content that is not there. The tag must be the left-hand side.
    const message = formatSyncAncestryVerdict(
      facts({ claimedVersion: '0.9.0', tag: 'v0.9.0', isAncestor: false })
    );

    expect(message).toContain('git diff v0.9.0 HEAD -- <those files>');
    expect(message).not.toContain('git diff <previous-tag> HEAD');
  });

  it('carries the actual claimed version, not a hardcoded one', () => {
    const message = formatSyncAncestryVerdict(
      facts({ claimedVersion: '0.9.0', tag: 'v0.9.0', isAncestor: false })
    );

    expect(message).toContain('Sunrise 0.9.0');
    expect(message).toContain('git merge -s ours v0.9.0');
  });
});

describe('isNotAncestorExit', () => {
  it('treats exit status 1 as the answer "not an ancestor"', () => {
    // git merge-base --is-ancestor reports its verdict through the exit code,
    // so the negative answer necessarily arrives as a thrown error.
    expect(isNotAncestorExit({ status: 1 })).toBe(true);
  });

  it('does NOT swallow a real git failure as a clean negative', () => {
    // 128 is "not a git repository" / "bad object". Reading that as "not an
    // ancestor" would fail the build claiming a broken merge base when git
    // simply could not run — a wrong diagnosis is worse than no check.
    expect(isNotAncestorExit({ status: 128 })).toBe(false);
  });

  it('does not treat a status-less error as an answer', () => {
    expect(isNotAncestorExit(new Error('spawn ENOENT'))).toBe(false);
    expect(isNotAncestorExit({ status: undefined })).toBe(false);
  });

  it('does not confuse a string status with the numeric exit code', () => {
    expect(isNotAncestorExit({ status: '1' })).toBe(false);
  });

  it('handles non-object throws without exploding', () => {
    // A thrown string/null would crash a bare `(error as {...}).status` read.
    expect(isNotAncestorExit(null)).toBe(false);
    expect(isNotAncestorExit('boom')).toBe(false);
    expect(isNotAncestorExit(undefined)).toBe(false);
  });
});

describe('planRefBootstrap', () => {
  const state = (o: Partial<RepoRefState> = {}): RepoRefState => ({
    tagResolvable: true,
    isShallow: false,
    hasUpstreamRemote: true,
    ...o,
  });

  it('does nothing when the tag resolves and the clone is complete', () => {
    // The maintainer's laptop: no network access, no git config touched.
    const plan = planRefBootstrap(state());

    expect(planIsNoop(plan)).toBe(true);
  });

  it('fetches tags and adds the remote in a bare CI clone', () => {
    // Daybreak's origin carries no Sunrise vX.Y.Z tags, so without this the
    // guard skipped on every CI run and a squash-merged sync PR merged green.
    const plan = planRefBootstrap(
      state({ tagResolvable: false, hasUpstreamRemote: false, isShallow: true })
    );

    expect(plan).toEqual({ unshallow: true, addRemote: true, fetchTags: true });
  });

  it('fetches tags WITHOUT re-adding a remote that already exists', () => {
    const plan = planRefBootstrap(state({ tagResolvable: false, hasUpstreamRemote: true }));

    expect(plan.fetchTags).toBe(true);
    expect(plan.addRemote).toBe(false);
  });

  it('deepens a shallow clone EVEN WHEN the tag already resolves', () => {
    // The subtle one. On a depth-1 clone HEAD has no parents, so
    // `merge-base --is-ancestor` answers "not an ancestor" for everything —
    // the guard would fail every build with a confident false accusation.
    // Deepening is required before a negative answer can be trusted, so it
    // must not be folded into the tag-missing branch.
    const plan = planRefBootstrap(state({ tagResolvable: true, isShallow: true }));

    expect(plan.unshallow).toBe(true);
    expect(plan.fetchTags).toBe(false);
    expect(planIsNoop(plan)).toBe(false);
  });

  it('never adds a remote when the tag is already resolvable', () => {
    const plan = planRefBootstrap(state({ tagResolvable: true, hasUpstreamRemote: false }));

    expect(plan.addRemote).toBe(false);
    expect(plan.fetchTags).toBe(false);
  });
});

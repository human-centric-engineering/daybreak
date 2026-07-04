/**
 * The read-access seam (f-journey-state t-2) — `canRead` / `subjectScope`.
 *
 * Pure and DB-free (the single-user path takes no DB), so this is a `tests/unit`
 * file. Covers the four contracted decisions today plus the #367-input shape:
 * self-read allow, admin-support allow, default-deny, and that `scope`
 * (`own|team|all` + tier) is *carried* without the predicate branching on
 * unmodelled inputs yet.
 */

import { describe, it, expect } from 'vitest';
import {
  canRead,
  subjectScope,
  type JourneyViewer,
  type AccessScope,
} from '@/lib/framework/shared/access';

const alice: JourneyViewer = { userId: 'user_alice' };
const support: JourneyViewer = { userId: 'user_support', isAdminSupport: true };

describe('canRead', () => {
  it('allows a viewer to read their own subject', async () => {
    await expect(canRead(alice, 'user_alice')).resolves.toBe(true);
  });

  it('allows an explicit admin-support viewer to read another subject', async () => {
    await expect(canRead(support, 'user_alice')).resolves.toBe(true);
  });

  it('default-denies an unrelated viewer', async () => {
    await expect(canRead(alice, 'user_bob')).resolves.toBe(false);
  });

  it('does not treat a plain role-less viewer as support', async () => {
    // No `isAdminSupport` flag ⇒ no override, even for a non-self subject.
    await expect(canRead({ userId: 'user_x' }, 'user_bob')).resolves.toBe(false);
  });

  it('carries `scope` without granting cross-user reads on unmodelled inputs (async #367 contract)', async () => {
    // `own | team | all` + tier are accepted and carried, but no cross-user grant
    // is modelled today, so a non-self / non-support viewer is still denied
    // regardless of what `scope` asks for. When #367 lands this delegates instead.
    const scopes: AccessScope[] = [
      { ownership: 'own' },
      { ownership: 'team' },
      { ownership: 'all' },
      { ownership: 'all', tier: 'premium' },
    ];
    for (const scope of scopes) {
      await expect(canRead(alice, 'user_bob', scope)).resolves.toBe(false);
    }
  });

  it('returns a Promise (async from day one — decision 7)', () => {
    expect(canRead(alice, 'user_alice')).toBeInstanceOf(Promise);
  });
});

describe('subjectScope', () => {
  it('narrows to the viewer’s own subject by default (single-user Lelanea)', async () => {
    await expect(subjectScope(alice)).resolves.toEqual({ userId: 'user_alice' });
  });

  it('still narrows to own for a non-support viewer asking for `all` (no silent broadening)', async () => {
    await expect(subjectScope(alice, { ownership: 'all' })).resolves.toEqual({
      userId: 'user_alice',
    });
  });

  it('widens to every subject ({}) for admin-support explicitly asking for `all`', async () => {
    await expect(subjectScope(support, { ownership: 'all' })).resolves.toEqual({});
  });

  it('keeps admin-support narrowed to own unless `all` is explicitly requested', async () => {
    await expect(subjectScope(support, { ownership: 'own' })).resolves.toEqual({
      userId: 'user_support',
    });
    await expect(subjectScope(support)).resolves.toEqual({ userId: 'user_support' });
  });
});

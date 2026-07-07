/**
 * Guard-floor contributor registry (core seam, added by Daybreak f-policies t-3). Proves the seam
 * is inert when empty (vanilla behaviour), raises never lowers, merges the strictest floor across
 * contributors, is idempotent per key, and swallows a throwing contributor.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerGuardFloorContributor,
  __resetGuardFloorContributorsForTests,
  resolveGuardFloors,
  applyGuardFloor,
} from '@/lib/orchestration/chat/guard-floor';

const ctx = { contextType: 'facilitation', contextId: 'onboarding', agentId: 'a1' };

beforeEach(() => __resetGuardFloorContributorsForTests());

describe('applyGuardFloor', () => {
  it('returns base unchanged when there is no floor (inert)', () => {
    expect(applyGuardFloor('log_only', undefined)).toBe('log_only');
    expect(applyGuardFloor('none', undefined)).toBe('none');
  });

  it('raises to the floor when it is stricter', () => {
    expect(applyGuardFloor('none', 'block')).toBe('block');
    expect(applyGuardFloor('log_only', 'warn_and_continue')).toBe('warn_and_continue');
  });

  it('never lowers below the base mode', () => {
    expect(applyGuardFloor('block', 'log_only')).toBe('block');
    expect(applyGuardFloor('warn_and_continue', 'warn_and_continue')).toBe('warn_and_continue');
  });

  it('treats an unknown base as lowest, so any known floor raises it', () => {
    expect(applyGuardFloor('mystery', 'log_only')).toBe('log_only');
  });
});

describe('resolveGuardFloors', () => {
  it('returns {} when the registry is empty (the seam is inert — vanilla behaviour)', async () => {
    expect(await resolveGuardFloors(ctx)).toEqual({});
  });

  it('merges the strictest floor per guard across contributors', async () => {
    registerGuardFloorContributor('a', async () => ({
      input: 'warn_and_continue',
      output: 'block',
    }));
    registerGuardFloorContributor('b', async () => ({ input: 'block' })); // stricter input wins
    expect(await resolveGuardFloors(ctx)).toEqual({ input: 'block', output: 'block' });
  });

  it('skips a contributor that throws (a floor lookup must never break a turn)', async () => {
    registerGuardFloorContributor('throws', async () => {
      throw new Error('boom');
    });
    registerGuardFloorContributor('ok', async () => ({ citation: 'block' }));
    expect(await resolveGuardFloors(ctx)).toEqual({ citation: 'block' });
  });

  it('replaces a contributor registered under the same key (idempotent)', async () => {
    registerGuardFloorContributor('k', async () => ({ input: 'block' }));
    registerGuardFloorContributor('k', async () => ({ input: 'log_only' }));
    expect(await resolveGuardFloors(ctx)).toEqual({ input: 'log_only' });
  });
});

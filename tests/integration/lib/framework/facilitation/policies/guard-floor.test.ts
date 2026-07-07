/**
 * Facilitation guard-floor contributor (f-policies t-3). Mocks the enabled-policy query; keeps the
 * real guardMinimumPayloadSchema. Proves the contributor only fires for facilitation surfaces,
 * matches the turn's role, takes the strictest minimum per guard, and skips malformed payloads.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/policies/policy-queries', () => ({
  listEnabledFacilitationPolicies: vi.fn(),
}));

import { resolveFacilitationGuardFloor } from '@/lib/framework/facilitation/policies/guard-floor';
import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { FACILITATION_SURFACE_CONTEXT_TYPE } from '@/lib/framework/facilitation/agents/surface';

const turn = (over: Record<string, unknown> = {}) => ({
  contextType: FACILITATION_SURFACE_CONTEXT_TYPE,
  contextId: 'onboarding',
  agentId: 'a1',
  ...over,
});
const guardMinimum = (roleId: string, minimums: Record<string, string>) => ({
  id: 'fp-1',
  kind: 'guard_minimum',
  payload: { scope: { type: 'facilitation_role', id: roleId }, minimums },
});

beforeEach(() => vi.clearAllMocks());

describe('resolveFacilitationGuardFloor', () => {
  it('is inert for a non-facilitation surface (no policy query)', async () => {
    expect(await resolveFacilitationGuardFloor(turn({ contextType: 'module' }))).toEqual({});
    expect(listEnabledFacilitationPolicies).not.toHaveBeenCalled();
  });

  it('is inert when the turn carries no contextId (role)', async () => {
    expect(await resolveFacilitationGuardFloor(turn({ contextId: undefined }))).toEqual({});
    expect(listEnabledFacilitationPolicies).not.toHaveBeenCalled();
  });

  it('returns {} when there are no guard_minimum policies', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([]);
    expect(await resolveFacilitationGuardFloor(turn())).toEqual({});
  });

  it('returns the floor of a policy scoped to the turn role', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      guardMinimum('onboarding', { output: 'block', input: 'warn_and_continue' }),
    ] as never);
    expect(await resolveFacilitationGuardFloor(turn())).toEqual({
      output: 'block',
      input: 'warn_and_continue',
    });
  });

  it('ignores a policy scoped to a different role', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      guardMinimum('state', { output: 'block' }),
    ] as never);
    expect(await resolveFacilitationGuardFloor(turn())).toEqual({});
  });

  it('takes the strictest minimum per guard across matching policies', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      guardMinimum('onboarding', { input: 'warn_and_continue' }),
      guardMinimum('onboarding', { input: 'block', citation: 'log_only' }),
    ] as never);
    expect(await resolveFacilitationGuardFloor(turn())).toEqual({
      input: 'block',
      citation: 'log_only',
    });
  });

  it('skips a malformed policy payload (empty minimums fails validation)', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      guardMinimum('onboarding', {}),
    ] as never);
    expect(await resolveFacilitationGuardFloor(turn())).toEqual({});
  });
});

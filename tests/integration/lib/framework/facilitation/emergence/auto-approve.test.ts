/**
 * Auto-approval resolver (f-emergence t-3). Mocks the enabled-policy query; keeps the real
 * autoApprovalPayloadSchema. Proves `none` is the safe floor, `low_risk` needs a permitting policy
 * with no `none`, malformed rows are skipped, and `isAutoApprovable` is inert in v1 (unclassified).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/policies/policy-queries', () => ({
  listEnabledFacilitationPolicies: vi.fn(),
}));

import {
  getAutoApproveMode,
  isAutoApprovable,
} from '@/lib/framework/facilitation/emergence/auto-approve';
import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';

const pol = (autoApprove: string) => ({
  id: 'fp',
  kind: 'auto_approval',
  payload: { autoApprove },
});

beforeEach(() => vi.clearAllMocks());

describe('getAutoApproveMode', () => {
  it('defaults to none when there are no policies', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([]);
    expect(await getAutoApproveMode()).toBe('none');
  });

  it('resolves low_risk when a permitting policy exists and none forbids', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([pol('low_risk')] as never);
    expect(await getAutoApproveMode()).toBe('low_risk');
  });

  it('forces none when ANY policy says none (the safe floor)', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      pol('low_risk'),
      pol('none'),
    ] as never);
    expect(await getAutoApproveMode()).toBe('none');
  });

  it('skips a malformed policy', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      { id: 'x', kind: 'auto_approval', payload: { autoApprove: 'bogus' } },
    ] as never);
    expect(await getAutoApproveMode()).toBe('none');
  });
});

describe('isAutoApprovable', () => {
  it('is false for an unclassified proposal (v1 — taxonomy deferred), even under low_risk mode', () => {
    expect(isAutoApprovable('low_risk', 'unclassified')).toBe(false);
    expect(isAutoApprovable('none', 'unclassified')).toBe(false);
  });

  it('is true only for a low_risk proposal under low_risk mode', () => {
    expect(isAutoApprovable('low_risk', 'low_risk')).toBe(true);
    expect(isAutoApprovable('none', 'low_risk')).toBe(false);
  });
});

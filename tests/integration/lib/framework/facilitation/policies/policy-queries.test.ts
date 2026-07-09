/**
 * Facilitation policy read queries (f-policies t-1). Mocks the DB client; proves the list — all
 * policies vs a `kind`-filtered subset — with the stable ordering.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { facilitationPolicy: { findMany: vi.fn(), findUnique: vi.fn() } },
}));

import {
  listFacilitationPolicies,
  listEnabledFacilitationPolicies,
  getFacilitationPolicy,
} from '@/lib/framework/facilitation/policies/policy-queries';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.facilitationPolicy.findMany).mockResolvedValue([{ id: 'fp-1' }] as never);
});

describe('getFacilitationPolicy', () => {
  it('returns a policy by id', async () => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue({
      id: 'fp-1',
      kind: 'auto_approval',
    } as never);
    const policy = await getFacilitationPolicy('fp-1');
    expect(prisma.facilitationPolicy.findUnique).toHaveBeenCalledWith({ where: { id: 'fp-1' } });
    expect(policy).toMatchObject({ id: 'fp-1', kind: 'auto_approval' });
  });

  it('throws NotFoundError when the policy is absent', async () => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue(null);
    await expect(getFacilitationPolicy('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listFacilitationPolicies', () => {
  it('lists all policies (no filter) ordered by kind then createdAt', async () => {
    await listFacilitationPolicies();
    expect(prisma.facilitationPolicy.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('filters to a single kind when given', async () => {
    await listFacilitationPolicies('auto_approval');
    expect(prisma.facilitationPolicy.findMany).toHaveBeenCalledWith({
      where: { kind: 'auto_approval' },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
  });
});

describe('listEnabledFacilitationPolicies', () => {
  it('filters to enabled rows of one kind, oldest-first', async () => {
    await listEnabledFacilitationPolicies('relevance_gating');
    expect(prisma.facilitationPolicy.findMany).toHaveBeenCalledWith({
      where: { kind: 'relevance_gating', enabled: true },
      orderBy: { createdAt: 'asc' },
    });
  });
});

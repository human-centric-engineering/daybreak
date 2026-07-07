/**
 * Facilitation policy read queries (f-policies t-1). Mocks the DB client; proves the list — all
 * policies vs a `kind`-filtered subset — with the stable ordering.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { facilitationPolicy: { findMany: vi.fn() } },
}));

import { listFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { prisma } from '@/lib/db/client';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.facilitationPolicy.findMany).mockResolvedValue([{ id: 'fp-1' }] as never);
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

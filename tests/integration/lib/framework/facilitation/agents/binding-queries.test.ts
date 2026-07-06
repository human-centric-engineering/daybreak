/**
 * Facilitation agent-binding read queries (f-facilitation-agents t-1). Mocks the DB client;
 * proves the batch-stitch of the bound agent's display fields (no N+1), the tombstone
 * surfacing, and the empty-family short-circuit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    facilitationAgentBinding: { findMany: vi.fn() },
    aiAgent: { findMany: vi.fn() },
  },
}));

import { listFacilitationBindings } from '@/lib/framework/facilitation/agents/binding-queries';
import { prisma } from '@/lib/db/client';

beforeEach(() => vi.clearAllMocks());

describe('listFacilitationBindings', () => {
  it('returns an empty list without a second query when there are no bindings', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findMany).mockResolvedValue([] as never);
    expect(await listFacilitationBindings()).toEqual([]);
    expect(prisma.aiAgent.findMany).not.toHaveBeenCalled();
  });

  it('stitches each binding with its bound agent via one batched query (no N+1)', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findMany).mockResolvedValue([
      { id: 'fab-1', agentId: 'a1', role: 'onboarding' },
      { id: 'fab-2', agentId: 'a2', role: 'state' },
    ] as never);
    vi.mocked(prisma.aiAgent.findMany).mockResolvedValue([
      { id: 'a1', name: 'Guide', slug: 'guide', isActive: true, deletedAt: null },
      {
        id: 'a2',
        name: 'Gone',
        slug: '-deleted-a2',
        isActive: false,
        deletedAt: new Date('2026-01-01'),
      },
    ] as never);

    const rows = await listFacilitationBindings();
    expect(prisma.aiAgent.findMany).toHaveBeenCalledTimes(1); // batched, not per-row
    expect(rows[0].agent).toMatchObject({ slug: 'guide', deletedAt: null });
    expect(rows[1].agent?.deletedAt).toBeInstanceOf(Date); // tombstone surfaced, not dropped
  });

  it('sets agent to null when the bound agent row is missing', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findMany).mockResolvedValue([
      { id: 'fab-1', agentId: 'ghost', role: 'onboarding' },
    ] as never);
    vi.mocked(prisma.aiAgent.findMany).mockResolvedValue([] as never);
    expect((await listFacilitationBindings())[0].agent).toBeNull();
  });
});

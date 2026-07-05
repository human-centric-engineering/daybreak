/**
 * Module agent-binding read queries (f-module-bindings t-1).
 *
 * `listModuleBindings` stitches each binding with the bound agent's display fields
 * via a batched follow-up query (no Prisma relation on `agentId`, X6). These tests
 * mock `@/lib/db/client` and assert the stitch, the ordering, the soft-deleted /
 * missing-agent resolution, and the unknown-module 404.
 *
 * @see lib/framework/modules/bindings/queries.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const db = vi.hoisted(() => ({
  module: { findUnique: vi.fn() },
  moduleAgentBinding: { findMany: vi.fn() },
  aiAgent: { findMany: vi.fn() },
}));

vi.mock('@/lib/db/client', () => ({ prisma: db }));

import { listModuleBindings } from '@/lib/framework/modules/bindings/queries';
import { NotFoundError } from '@/lib/api/errors';

function binding(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'b1',
    moduleId: 'm1',
    agentId: 'agent-1',
    role: 'companion',
    isPrimary: false,
    config: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('listModuleBindings', () => {
  it('404s for an unknown module (never an empty list)', async () => {
    db.module.findUnique.mockResolvedValue(null);
    await expect(listModuleBindings('ghost')).rejects.toBeInstanceOf(NotFoundError);
    expect(db.moduleAgentBinding.findMany).not.toHaveBeenCalled();
  });

  it('returns [] for a real module with no bindings — and does not query agents', async () => {
    db.module.findUnique.mockResolvedValue({ id: 'm1' });
    db.moduleAgentBinding.findMany.mockResolvedValue([]);
    const rows = await listModuleBindings('reading');
    expect(rows).toEqual([]);
    expect(db.aiAgent.findMany).not.toHaveBeenCalled();
  });

  it('stitches each binding with its agent display fields (batched, deduped)', async () => {
    db.module.findUnique.mockResolvedValue({ id: 'm1' });
    db.moduleAgentBinding.findMany.mockResolvedValue([
      binding({ id: 'b1', agentId: 'agent-1', isPrimary: true }),
      binding({ id: 'b2', agentId: 'agent-1', role: 'reviewer' }),
    ]);
    db.aiAgent.findMany.mockResolvedValue([
      { id: 'agent-1', name: 'Companion', slug: 'companion-agent', isActive: true },
    ]);

    const rows = await listModuleBindings('reading');

    // One batched agent query for the deduped id set.
    expect(db.aiAgent.findMany).toHaveBeenCalledTimes(1);
    expect(db.aiAgent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['agent-1'] } } })
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].agent).toMatchObject({ id: 'agent-1', name: 'Companion', isActive: true });
    expect(rows[1].agent).toMatchObject({ id: 'agent-1' });
  });

  it('resolves a soft-deleted agent (isActive false) and a missing agent (null)', async () => {
    db.module.findUnique.mockResolvedValue({ id: 'm1' });
    db.moduleAgentBinding.findMany.mockResolvedValue([
      binding({ id: 'b1', agentId: 'soft' }),
      binding({ id: 'b2', agentId: 'gone' }),
    ]);
    db.aiAgent.findMany.mockResolvedValue([
      { id: 'soft', name: 'Retired', slug: 'retired', isActive: false },
    ]);

    const rows = await listModuleBindings('reading');
    expect(rows.find((r) => r.id === 'b1')?.agent).toMatchObject({ isActive: false });
    expect(rows.find((r) => r.id === 'b2')?.agent).toBeNull();
  });
});

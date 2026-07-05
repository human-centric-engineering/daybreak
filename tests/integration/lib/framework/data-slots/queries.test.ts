/**
 * Slot-definition read queries (f-slots + f-slot-capture t-2). Mocks `@/lib/db/client`
 * (no live DB, house style). Covers `getSlotDefinition` (the targeted-vs-open lookup
 * `fill_slot` keys on) and `listSlotDefinitions`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { slotDefinition: { findUnique: vi.fn(), findMany: vi.fn() } },
}));

import { getSlotDefinition, listSlotDefinitions } from '@/lib/framework/data-slots/queries';
import { prisma } from '@/lib/db/client';

beforeEach(() => vi.clearAllMocks());

describe('getSlotDefinition', () => {
  it('resolves a definition by its unique slug', async () => {
    const row = { slug: 'primary_goal', isActive: true };
    vi.mocked(prisma.slotDefinition.findUnique).mockResolvedValue(row as never);

    await expect(getSlotDefinition('primary_goal')).resolves.toEqual(row);
    expect(prisma.slotDefinition.findUnique).toHaveBeenCalledWith({
      where: { slug: 'primary_goal' },
    });
  });

  it('returns null for an undefined slug (an open-mint candidate)', async () => {
    vi.mocked(prisma.slotDefinition.findUnique).mockResolvedValue(null);
    await expect(getSlotDefinition('never_declared')).resolves.toBeNull();
  });
});

describe('listSlotDefinitions', () => {
  it('lists every definition ordered by slug', async () => {
    vi.mocked(prisma.slotDefinition.findMany).mockResolvedValue([{ slug: 'a' }] as never);
    await expect(listSlotDefinitions()).resolves.toEqual([{ slug: 'a' }]);
    expect(prisma.slotDefinition.findMany).toHaveBeenCalledWith({ orderBy: { slug: 'asc' } });
  });
});

/**
 * Boot-time slot-definition sync unit tests — the reconcile proof.
 *
 * House style: no live DB in vitest (real-DB verification is via `smoke:*`
 * scripts). We mock `executeTransaction` to forward its callback to a prisma `tx`
 * mock and assert the reconcile shape `syncRegisteredSlotDefinitions()` issues.
 * Unlike module sync (seed-once — the row has operator columns to preserve), a slot
 * definition is a pure code projection, so this sync *propagates edits*:
 *   - `createMany` writes newly-declared slugs, defaults resolved + `scope` stamped
 *     `module:<slug>`;
 *   - a per-slug `update` fires ONLY when a row's code-owned fields (or `isActive`)
 *     changed — an unchanged boot writes nothing;
 *   - a guarded `updateMany` deactivates code-removed rows;
 *   - an EMPTY set is a deliberate no-op — no transaction, no writes.
 * The module registry is real (slots are collected from registered modules).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import type { SlotDefinition } from '@prisma/client';
import type { SlotDefinitionInput } from '@/lib/framework/data-slots/definition';

const txMock = {
  slotDefinition: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('@/lib/db/utils', () => ({
  executeTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
    cb(txMock)
  ),
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { syncRegisteredSlotDefinitions } = await import('@/lib/framework/data-slots/sync');
const { registerModule, __resetModuleRegistryForTests } =
  await import('@/lib/framework/modules/registry');
const { executeTransaction } = await import('@/lib/db/utils');
const { logger } = await import('@/lib/logging');

const executeTransactionMock = executeTransaction as ReturnType<typeof vi.fn>;
const loggerInfo = logger.info as ReturnType<typeof vi.fn>;
const loggerWarn = logger.warn as ReturnType<typeof vi.fn>;

/** Register a module owning the given slot definitions. */
function registerModuleWithSlots(slug: string, slotDefinitions: SlotDefinitionInput[]): void {
  registerModule({
    slug,
    name: `Module ${slug}`,
    description: `The ${slug} module`,
    configSchema: z.object({}),
    slotDefinitions,
  });
}

/** A full row as the fake DB would return it — start from a resolved definition. */
function row(overrides: Partial<SlotDefinition> & Pick<SlotDefinition, 'slug'>): SlotDefinition {
  return {
    id: `slot_${overrides.slug}`,
    group: 'goals',
    description: 'A goal',
    scope: 'module:onboarding',
    visibility: 'open',
    mode: 'targeted',
    dataType: 'text',
    sensitivity: 'standard',
    priorityWeight: 0,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetModuleRegistryForTests();
  txMock.slotDefinition.findMany.mockResolvedValue([]);
  txMock.slotDefinition.updateMany.mockResolvedValue({ count: 0 });
});

describe('syncRegisteredSlotDefinitions', () => {
  it('empty set is a no-op: no transaction, no writes', async () => {
    // A module with no slots contributes nothing → empty set.
    registerModuleWithSlots('onboarding', []);

    await syncRegisteredSlotDefinitions();

    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(txMock.slotDefinition.createMany).not.toHaveBeenCalled();
    expect(txMock.slotDefinition.update).not.toHaveBeenCalled();
    expect(txMock.slotDefinition.updateMany).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      'syncRegisteredSlotDefinitions: no registered slot definitions — nothing to sync'
    );
  });

  it('creates new slugs with defaults resolved and scope stamped module:<slug>', async () => {
    registerModuleWithSlots('onboarding', [
      { slug: 'primary_goal', group: 'goals', description: 'The main goal' },
      {
        slug: 'health_note',
        group: 'health',
        description: 'A health note',
        sensitivity: 'special_category',
        dataType: 'json',
        visibility: 'hidden',
        mode: 'open',
        priorityWeight: 5,
      },
    ]);

    await syncRegisteredSlotDefinitions();

    expect(txMock.slotDefinition.createMany).toHaveBeenCalledTimes(1);
    expect(txMock.slotDefinition.createMany).toHaveBeenCalledWith({
      data: [
        {
          slug: 'primary_goal',
          group: 'goals',
          description: 'The main goal',
          scope: 'module:onboarding',
          visibility: 'open',
          mode: 'targeted',
          dataType: 'text',
          sensitivity: 'standard',
          priorityWeight: 0,
        },
        {
          slug: 'health_note',
          group: 'health',
          description: 'A health note',
          scope: 'module:onboarding',
          visibility: 'hidden',
          mode: 'open',
          dataType: 'json',
          sensitivity: 'special_category',
          priorityWeight: 5,
        },
      ],
      skipDuplicates: true,
    });
    // Nothing existing ⇒ no per-row updates.
    expect(txMock.slotDefinition.update).not.toHaveBeenCalled();
  });

  it('does not update an existing row whose code is unchanged (no churn)', async () => {
    registerModuleWithSlots('onboarding', [
      { slug: 'primary_goal', group: 'goals', description: 'The main goal' },
    ]);
    // The DB already holds the identical resolved row.
    txMock.slotDefinition.findMany.mockResolvedValue([
      row({
        slug: 'primary_goal',
        group: 'goals',
        description: 'The main goal',
        scope: 'module:onboarding',
      }),
    ]);

    await syncRegisteredSlotDefinitions();

    // Nothing new to create, nothing changed to update — the row is left alone.
    expect(txMock.slotDefinition.createMany).not.toHaveBeenCalled();
    expect(txMock.slotDefinition.update).not.toHaveBeenCalled();
  });

  it('updates an existing row whose code changed, writing the resolved fields + isActive true', async () => {
    registerModuleWithSlots('onboarding', [
      {
        slug: 'primary_goal',
        group: 'goals',
        description: 'A reworded goal',
        sensitivity: 'sensitive',
      },
    ]);
    // The DB row is stale (old description, previously deactivated).
    txMock.slotDefinition.findMany.mockResolvedValue([
      row({
        slug: 'primary_goal',
        group: 'goals',
        description: 'The main goal',
        sensitivity: 'standard',
        isActive: false,
      }),
    ]);

    await syncRegisteredSlotDefinitions();

    expect(txMock.slotDefinition.update).toHaveBeenCalledTimes(1);
    expect(txMock.slotDefinition.update).toHaveBeenCalledWith({
      where: { slug: 'primary_goal' },
      data: {
        slug: 'primary_goal',
        group: 'goals',
        description: 'A reworded goal',
        scope: 'module:onboarding',
        visibility: 'open',
        mode: 'targeted',
        dataType: 'text',
        sensitivity: 'sensitive',
        priorityWeight: 0,
        isActive: true,
      },
    });
  });

  it('deactivates rows whose code was removed, guarded to only touch active rows', async () => {
    registerModuleWithSlots('onboarding', [
      { slug: 'primary_goal', group: 'goals', description: 'The main goal' },
    ]);

    await syncRegisteredSlotDefinitions();

    expect(txMock.slotDefinition.updateMany).toHaveBeenCalledWith({
      where: { slug: { notIn: ['primary_goal'] }, isActive: true },
      data: { isActive: false },
    });
  });

  it('dedupes a slug declared by two modules — last registration wins, logged', async () => {
    registerModuleWithSlots('onboarding', [
      { slug: 'goal', group: 'goals', description: 'From onboarding' },
    ]);
    registerModuleWithSlots('review', [
      { slug: 'goal', group: 'goals', description: 'From review' },
    ]);

    await syncRegisteredSlotDefinitions();

    const created = txMock.slotDefinition.createMany.mock.calls[0]?.[0]?.data as Array<{
      slug: string;
      description: string;
      scope: string;
    }>;
    expect(created).toHaveLength(1);
    expect(created[0]?.description).toBe('From review');
    expect(created[0]?.scope).toBe('module:review');
    expect(loggerWarn).toHaveBeenCalledWith(
      'collectRegisteredSlotDefinitions: duplicate slot slug across modules — last registration wins',
      { slug: 'goal', moduleSlug: 'review' }
    );
  });

  it('runs the writes in one transaction with a raised timeout (#368)', async () => {
    registerModuleWithSlots('onboarding', [
      { slug: 'primary_goal', group: 'goals', description: 'The main goal' },
    ]);

    await syncRegisteredSlotDefinitions();

    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toEqual({ timeout: 20_000 });
  });

  it('logs registered / created / updated / deactivated counts', async () => {
    registerModuleWithSlots('onboarding', [
      { slug: 'primary_goal', group: 'goals', description: 'The main goal' },
    ]);
    txMock.slotDefinition.updateMany.mockResolvedValue({ count: 3 });

    await syncRegisteredSlotDefinitions();

    expect(loggerInfo).toHaveBeenCalledWith(
      'syncRegisteredSlotDefinitions: framework slot definitions synced',
      { registered: 1, created: 1, updated: 0, deactivated: 3 }
    );
  });
});

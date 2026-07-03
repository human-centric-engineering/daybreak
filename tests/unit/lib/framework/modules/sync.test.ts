/**
 * Boot-time module sync unit tests — the register → row proof.
 *
 * House style: no live DB in vitest (real-DB verification is via `smoke:*`
 * scripts). We mock `executeTransaction` to forward its callback to a prisma `tx`
 * mock and assert the SQL shape `syncRegisteredModules()` issues:
 *   - `createMany({ skipDuplicates })` writes code-owned data (`slug`, `name`) for
 *     NEW rows only — never `status`/`config`/window/`audience`, so operator columns
 *     survive;
 *   - a guarded `updateMany` re-registers a reappeared slug (only rows that change);
 *   - a guarded `updateMany` retires code-removed rows (`isRegistered=false`);
 *   - an EMPTY registry is a deliberate no-op — no transaction, no writes;
 *   - the success log reports both `registered` and `retired` counts.
 * The registry itself is real (we register fixtures through `registerModule()`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

const txMock = {
  module: {
    createMany: vi.fn(),
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

const { syncRegisteredModules } = await import('@/lib/framework/modules/sync');
const { registerModule, __resetModuleRegistryForTests } =
  await import('@/lib/framework/modules/registry');
const { executeTransaction } = await import('@/lib/db/utils');
const { logger } = await import('@/lib/logging');

const executeTransactionMock = executeTransaction as ReturnType<typeof vi.fn>;
const loggerInfo = logger.info as ReturnType<typeof vi.fn>;

function register(slug: string): void {
  registerModule({
    slug,
    name: `Module ${slug}`,
    description: `The ${slug} module`,
    configSchema: z.object({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetModuleRegistryForTests();
  // The retire updateMany returns a Prisma-shaped { count }.
  txMock.module.updateMany.mockResolvedValue({ count: 0 });
});

describe('syncRegisteredModules', () => {
  it('creates new rows with code-owned data only (skipDuplicates), never operator columns', async () => {
    register('alpha');
    register('beta');

    await syncRegisteredModules();

    expect(txMock.module.createMany).toHaveBeenCalledTimes(1);
    expect(txMock.module.createMany).toHaveBeenCalledWith({
      data: [
        { slug: 'alpha', name: 'Module alpha' },
        { slug: 'beta', name: 'Module beta' },
      ],
      skipDuplicates: true,
    });
    // create payloads carry no status / config / window / audience keys.
    const created = txMock.module.createMany.mock.calls[0]?.[0]?.data;
    for (const row of created) {
      expect(Object.keys(row).sort()).toEqual(['name', 'slug']);
    }
  });

  it('re-registers reappeared slugs and retires removed rows, each guarded to only touch changed rows', async () => {
    register('alpha');
    register('beta');

    await syncRegisteredModules();

    // Re-register pass: slugs present in code but currently isRegistered=false.
    expect(txMock.module.updateMany).toHaveBeenCalledWith({
      where: { slug: { in: ['alpha', 'beta'] }, isRegistered: false },
      data: { isRegistered: true },
    });
    // Retire pass: rows whose slug is not in code and still isRegistered=true.
    expect(txMock.module.updateMany).toHaveBeenCalledWith({
      where: { slug: { notIn: ['alpha', 'beta'] }, isRegistered: true },
      data: { isRegistered: false },
    });
  });

  it('empty registry is a no-op: no transaction, no writes', async () => {
    await syncRegisteredModules();

    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(txMock.module.createMany).not.toHaveBeenCalled();
    expect(txMock.module.updateMany).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      'syncRegisteredModules: no registered modules — nothing to sync'
    );
  });

  it('logs registered and retired counts', async () => {
    register('alpha');
    // Retire pass reports 2 rows flipped to unregistered.
    txMock.module.updateMany.mockResolvedValue({ count: 2 });

    await syncRegisteredModules();

    expect(loggerInfo).toHaveBeenCalledWith('syncRegisteredModules: framework modules synced', {
      registered: 1,
      retired: 2,
    });
  });

  it('runs the writes in one transaction with a raised timeout (#368)', async () => {
    register('alpha');

    await syncRegisteredModules();

    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toEqual({ timeout: 20_000 });
  });
});

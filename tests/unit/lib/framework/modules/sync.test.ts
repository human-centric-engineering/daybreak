/**
 * Boot-time module sync unit tests — the register → row proof.
 *
 * House style: no live DB in vitest (real-DB verification is via `smoke:*`
 * scripts). We mock `executeTransaction` to forward its callback to a prisma `tx`
 * mock and assert the SQL shape `syncRegisteredModules()` issues:
 *   - one upsert-by-slug per registered module, writing code-owned data only on
 *     create and touching ONLY `isRegistered` on update (operator columns —
 *     `status`, `config`, window, `audience` — are never in the update payload,
 *     so they survive every boot);
 *   - one `updateMany` flipping code-removed rows to `isRegistered=false`
 *     (retained for audit), scoped by `slug notIn <registered>`.
 * The registry itself is real (we register fixtures through `registerModule()`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

const txMock = {
  module: {
    upsert: vi.fn(),
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

const executeTransactionMock = executeTransaction as ReturnType<typeof vi.fn>;

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
});

describe('syncRegisteredModules', () => {
  it('upserts each registered module by slug, writing code data on create and only isRegistered on update', async () => {
    register('alpha');
    register('beta');

    await syncRegisteredModules();

    expect(txMock.module.upsert).toHaveBeenCalledTimes(2);
    expect(txMock.module.upsert).toHaveBeenCalledWith({
      where: { slug: 'alpha' },
      create: { slug: 'alpha', name: 'Module alpha', isRegistered: true },
      update: { isRegistered: true },
    });
    expect(txMock.module.upsert).toHaveBeenCalledWith({
      where: { slug: 'beta' },
      create: { slug: 'beta', name: 'Module beta', isRegistered: true },
      update: { isRegistered: true },
    });
  });

  it('never clobbers operator columns — the update payload is isRegistered only', async () => {
    register('alpha');

    await syncRegisteredModules();

    const updatePayload = txMock.module.upsert.mock.calls[0]?.[0]?.update;
    // Exactly { isRegistered: true } — no status / config / window / audience keys,
    // so an operator's edits to those columns survive the sync.
    expect(updatePayload).toEqual({ isRegistered: true });
  });

  it('flags code-removed rows isRegistered=false, scoped by slug notIn the registered set', async () => {
    register('alpha');
    register('beta');

    await syncRegisteredModules();

    expect(txMock.module.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.module.updateMany).toHaveBeenCalledWith({
      where: { slug: { notIn: ['alpha', 'beta'] }, isRegistered: true },
      data: { isRegistered: false },
    });
  });

  it('empty registry: no upserts, and updateMany(notIn: []) unregisters every prior row', async () => {
    await syncRegisteredModules();

    expect(txMock.module.upsert).not.toHaveBeenCalled();
    // notIn: [] matches all rows — correct: no code registered ⇒ nothing is registered.
    expect(txMock.module.updateMany).toHaveBeenCalledWith({
      where: { slug: { notIn: [] }, isRegistered: true },
      data: { isRegistered: false },
    });
  });

  it('runs the writes in one transaction with a raised timeout (#368)', async () => {
    register('alpha');

    await syncRegisteredModules();

    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toEqual({ timeout: 20_000 });
  });
});

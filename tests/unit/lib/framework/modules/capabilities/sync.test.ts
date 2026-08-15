/**
 * Boot-time module-capability `ai_capability` sync unit tests — the reconcile proof.
 *
 * House style: no live DB in vitest. We mock `executeTransaction` to forward its
 * callback a prisma `tx` mock and assert the reconcile shape. Unlike a slot
 * definition (pure code projection), an `ai_capability` row has operator-owned
 * columns (rateLimit, requiresApproval, …) that create sets but updates must NEVER
 * clobber; `isActive` is sync-managed (admins can't toggle an isSystem row). The
 * deactivate pass is scoped to the admin-unreachable `category='module' + isSystem`
 * marker, and the "did registration run?" guard keys on MODULES.
 *
 * Since v1.3 Phase 1 t-1.2 the sync also refuses to run ahead of the handler
 * registration, which is where core enforces the PII contract — hence the
 * `has()` on the dispatcher mock, defaulted to "registered".
 *
 * @see lib/framework/modules/capabilities/sync.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import type { AiCapability } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityFunctionDefinition,
  CapabilitySchema,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

const txMock = {
  aiCapability: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};
const dispatcherMock = { clearCache: vi.fn(), has: vi.fn((_slug: string) => true) };

vi.mock('@/lib/db/utils', () => ({
  executeTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
    cb(txMock)
  ),
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/orchestration/capabilities/dispatcher', () => ({
  capabilityDispatcher: dispatcherMock,
}));

const { syncRegisteredModuleCapabilities } =
  await import('@/lib/framework/modules/capabilities/sync');
const { registerModule, __resetModuleRegistryForTests } =
  await import('@/lib/framework/modules/registry');
const { executeTransaction } = await import('@/lib/db/utils');
const executeTransactionMock = executeTransaction as ReturnType<typeof vi.fn>;

const MARKER_WHERE = { path: ['framework'], equals: 'module-capability' };

class Tool extends BaseCapability {
  readonly slug: string;
  readonly functionDefinition: CapabilityFunctionDefinition;
  protected readonly schema: CapabilitySchema<unknown> = z.object({});
  constructor(slug: string, description = `${slug} desc`) {
    super();
    this.slug = slug;
    this.functionDefinition = { name: slug, description, parameters: {} };
  }
  async execute(): Promise<CapabilityResult> {
    return this.success({});
  }
}

function registerModuleWithCaps(slug: string, caps: BaseCapability[]): void {
  registerModule({
    slug,
    name: slug,
    description: slug,
    configSchema: z.object({}),
    capabilities: caps,
  });
}

/** A row as the fake DB would return it. */
function row(overrides: Partial<AiCapability> & Pick<AiCapability, 'slug'>): AiCapability {
  return {
    id: `cap_${overrides.slug}`,
    name: overrides.slug,
    description: 'reading__save_worksheet desc',
    category: 'module',
    functionDefinition: { name: 'reading__save_worksheet', description: 'x', parameters: {} },
    executionType: 'internal',
    executionHandler: 'framework-module:reading/save_worksheet',
    executionConfig: null,
    requiresApproval: false,
    approvalTimeoutMs: null,
    rateLimit: null,
    isIdempotent: false,
    isActive: true,
    isSystem: true,
    quarantineState: 'active',
    quarantineReason: null,
    quarantineUntil: null,
    metadata: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetModuleRegistryForTests();
  txMock.aiCapability.findMany.mockResolvedValue([]);
  txMock.aiCapability.updateMany.mockResolvedValue({ count: 0 });
  // `vi.clearAllMocks()` wipes the implementation too — restore the default: every
  // collected capability already has a registered handler (the normal boot order).
  dispatcherMock.has.mockReturnValue(true);
});

/** The functionDefinition a namespaced `Tool(slug)` produces, in canonical shape. */
function fnDef(slug: string, description = `${slug} desc`) {
  return { name: `reading__${slug}`, description, parameters: {} };
}

describe('syncRegisteredModuleCapabilities', () => {
  it('no registered modules is a no-op: no transaction, no writes, no cache clear', async () => {
    await syncRegisteredModuleCapabilities();
    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(txMock.aiCapability.createMany).not.toHaveBeenCalled();
    expect(dispatcherMock.clearCache).not.toHaveBeenCalled();
  });

  it('skips a capability whose slug cannot namespace, instead of failing the sync', async () => {
    // The register half skips it (fail-soft); if `collect()` still threw on the same
    // derivation, the sync would abandon mid-boot and every later step would be skipped —
    // the exact failure the fail-soft change exists to prevent.
    registerModuleWithCaps('reading', [new Tool('save-worksheet'), new Tool('read_progress')]);

    await syncRegisteredModuleCapabilities({
      registered: ['reading__read_progress'],
      refused: [{ moduleSlug: 'reading', capabilitySlug: 'save-worksheet', reason: 'snake_case' }],
    });

    const created = txMock.aiCapability.createMany.mock.calls[0][0].data;
    expect(created.map((r: { slug: string }) => r.slug)).toEqual(['reading__read_progress']);
  });

  it('writes no row for a declared capability whose handler was refused (no report)', async () => {
    // The PII contract (`processesPii` ⇒ `redactProvenance()`) is enforced by core inside
    // `capabilityDispatcher.register()`, which skips an offender. A row here would
    // advertise — and let an admin grant — a tool that can never dispatch.
    registerModuleWithCaps('reading', [new Tool('save_worksheet'), new Tool('read_progress')]);
    dispatcherMock.has.mockImplementation((slug: string) => slug !== 'reading__save_worksheet');

    await syncRegisteredModuleCapabilities();

    const created = txMock.aiCapability.createMany.mock.calls[0][0].data;
    expect(created.map((r: { slug: string }) => r.slug)).toEqual(['reading__read_progress']);
    // The refused one is excluded from the keep-list, so an existing row deactivates.
    expect(txMock.aiCapability.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ slug: { notIn: ['reading__read_progress'] } }),
      })
    );
  });

  it('deactivates the row of a capability registration refused — even if it is the only one', async () => {
    // The upgrade case the CHANGELOG warns about: a leaf with ONE module capability whose
    // `redactProvenance` shape core now refuses. Inferring from the handler map would read
    // this as "registration never ran" and skip, leaving the row active, admin-grantable
    // and permanently non-dispatchable. The registration report says otherwise.
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);

    await syncRegisteredModuleCapabilities({
      registered: [],
      refused: [{ moduleSlug: 'reading', capabilitySlug: 'save_worksheet', reason: 'no redactor' }],
    });

    expect(txMock.aiCapability.createMany).not.toHaveBeenCalled();
    // No keep-list ⇒ every framework-marked row deactivates, including this one.
    expect(txMock.aiCapability.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ slug: expect.anything() }),
        data: { isActive: false },
      })
    );
  });

  it('reconciles against the registration report, not the dispatcher handler map', async () => {
    // The handler map is `globalThis`-backed, so on a re-boot in one process it can still
    // report a handler for a capability THIS boot refused. The report is authoritative.
    registerModuleWithCaps('reading', [new Tool('save_worksheet'), new Tool('read_progress')]);
    dispatcherMock.has.mockReturnValue(true); // stale handlers from a previous boot

    await syncRegisteredModuleCapabilities({
      registered: ['reading__read_progress'],
      refused: [{ moduleSlug: 'reading', capabilitySlug: 'save_worksheet', reason: 'x' }],
    });

    const created = txMock.aiCapability.createMany.mock.calls[0][0].data;
    expect(created.map((r: { slug: string }) => r.slug)).toEqual(['reading__read_progress']);
    expect(dispatcherMock.has).not.toHaveBeenCalled();
  });

  it('skips entirely when NO declared capability has a handler (never mass-deactivates)', async () => {
    // An absent or failed registration pass, not an author deleting every tool — the same
    // reasoning as the zero-modules guard, one level down.
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    dispatcherMock.has.mockReturnValue(false);

    await syncRegisteredModuleCapabilities();

    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(txMock.aiCapability.updateMany).not.toHaveBeenCalled();
  });

  it('creates a row (batched) for a newly-declared capability with the framework marker', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    await syncRegisteredModuleCapabilities();

    expect(txMock.aiCapability.createMany).toHaveBeenCalledTimes(1);
    const arg = txMock.aiCapability.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    const data = arg.data[0];
    expect(data).toMatchObject({
      slug: 'reading__save_worksheet',
      category: 'module',
      isSystem: true,
      isActive: true,
      executionType: 'internal',
      executionHandler: 'framework-module:reading/save_worksheet',
      metadata: { framework: 'module-capability' },
    });
    expect(data.functionDefinition.name).toBe('reading__save_worksheet');
    // A write happened → the dispatcher's registry cache is invalidated.
    expect(dispatcherMock.clearCache).toHaveBeenCalledTimes(1);
  });

  it('does not update an unchanged existing row (no-write-when-unchanged), and does not clear the cache', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    txMock.aiCapability.findMany.mockResolvedValue([
      row({
        slug: 'reading__save_worksheet',
        description: 'save_worksheet desc',
        functionDefinition: fnDef('save_worksheet'),
      }),
    ]);

    await syncRegisteredModuleCapabilities();
    expect(txMock.aiCapability.createMany).not.toHaveBeenCalled();
    expect(txMock.aiCapability.update).not.toHaveBeenCalled();
    expect(dispatcherMock.clearCache).not.toHaveBeenCalled();
  });

  it('treats a jsonb key-reordered functionDefinition as unchanged (canonical compare)', async () => {
    // Postgres returns jsonb with reordered keys; a raw JSON.stringify diff would see a
    // false change and rewrite the row every boot. Canonical compare must not.
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    txMock.aiCapability.findMany.mockResolvedValue([
      row({
        slug: 'reading__save_worksheet',
        description: 'save_worksheet desc',
        // Keys deliberately in a different order than the code constructs them.
        functionDefinition: {
          parameters: {},
          description: 'save_worksheet desc',
          name: 'reading__save_worksheet',
        },
      }),
    ]);

    await syncRegisteredModuleCapabilities();
    expect(txMock.aiCapability.update).not.toHaveBeenCalled();
  });

  it('updates only the code-projected columns when the tool changed, preserving operator columns', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet', 'a NEW description')]);
    txMock.aiCapability.findMany.mockResolvedValue([
      row({ slug: 'reading__save_worksheet', description: 'old description' }),
    ]);

    await syncRegisteredModuleCapabilities();

    expect(txMock.aiCapability.update).toHaveBeenCalledTimes(1);
    const data = txMock.aiCapability.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ description: 'a NEW description', isActive: true });
    // Operator-owned columns are NOT in the update payload.
    expect(data).not.toHaveProperty('requiresApproval');
    expect(data).not.toHaveProperty('rateLimit');
    expect(data).not.toHaveProperty('isSystem');
  });

  it('reactivates an inactive row on re-declaration', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    txMock.aiCapability.findMany.mockResolvedValue([
      row({
        slug: 'reading__save_worksheet',
        description: 'save_worksheet desc',
        functionDefinition: fnDef('save_worksheet'),
        isActive: false,
      }),
    ]);

    await syncRegisteredModuleCapabilities();
    expect(txMock.aiCapability.update).toHaveBeenCalledTimes(1);
    expect(txMock.aiCapability.update.mock.calls[0][0].data).toMatchObject({ isActive: true });
  });

  it('deactivates removed capabilities, scoped to the framework metadata marker', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    await syncRegisteredModuleCapabilities();

    expect(txMock.aiCapability.updateMany).toHaveBeenCalledWith({
      where: {
        metadata: MARKER_WHERE,
        isActive: true,
        slug: { notIn: ['reading__save_worksheet'] },
      },
      data: { isActive: false },
    });
  });

  it('a module with zero capabilities still reconciles (deactivate with no notIn)', async () => {
    // Registration ran (a module exists), but it declares no tools — so any stale
    // framework-owned rows must be deactivated, and `notIn` is omitted (never `[]`).
    registerModuleWithCaps('reading', []);
    await syncRegisteredModuleCapabilities();

    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(txMock.aiCapability.updateMany).toHaveBeenCalledWith({
      where: { metadata: MARKER_WHERE, isActive: true },
      data: { isActive: false },
    });
  });
});

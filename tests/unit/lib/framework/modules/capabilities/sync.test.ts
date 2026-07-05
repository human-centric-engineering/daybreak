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
    create: vi.fn(),
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

const { syncRegisteredModuleCapabilities } =
  await import('@/lib/framework/modules/capabilities/sync');
const { registerModule, __resetModuleRegistryForTests } =
  await import('@/lib/framework/modules/registry');
const { executeTransaction } = await import('@/lib/db/utils');
const executeTransactionMock = executeTransaction as ReturnType<typeof vi.fn>;

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
    executionHandler: 'Tool (module:reading)',
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
});

describe('syncRegisteredModuleCapabilities', () => {
  it('no registered modules is a no-op: no transaction, no writes', async () => {
    await syncRegisteredModuleCapabilities();
    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(txMock.aiCapability.create).not.toHaveBeenCalled();
  });

  it('creates a row for a newly-declared capability with the framework marker', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    await syncRegisteredModuleCapabilities();

    expect(txMock.aiCapability.create).toHaveBeenCalledTimes(1);
    const data = txMock.aiCapability.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      slug: 'reading__save_worksheet',
      category: 'module',
      isSystem: true,
      isActive: true,
      executionType: 'internal',
    });
    // The LLM-facing name is the provider-legal derivation, not the dotted slug.
    expect(data.functionDefinition.name).toBe('reading__save_worksheet');
  });

  it('does not update an unchanged existing row (no-write-when-unchanged)', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    txMock.aiCapability.findMany.mockResolvedValue([
      row({
        slug: 'reading__save_worksheet',
        description: 'save_worksheet desc',
        executionHandler: 'Tool (module:reading)',
        functionDefinition: {
          name: 'reading__save_worksheet',
          description: 'save_worksheet desc',
          parameters: {},
        },
      }),
    ]);

    await syncRegisteredModuleCapabilities();
    expect(txMock.aiCapability.create).not.toHaveBeenCalled();
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
        functionDefinition: {
          name: 'reading__save_worksheet',
          description: 'save_worksheet desc',
          parameters: {},
        },
        isActive: false,
      }),
    ]);

    await syncRegisteredModuleCapabilities();
    expect(txMock.aiCapability.update).toHaveBeenCalledTimes(1);
    expect(txMock.aiCapability.update.mock.calls[0][0].data).toMatchObject({ isActive: true });
  });

  it('deactivates removed capabilities, scoped to the framework marker', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    await syncRegisteredModuleCapabilities();

    expect(txMock.aiCapability.updateMany).toHaveBeenCalledWith({
      where: {
        category: 'module',
        isSystem: true,
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
      where: { category: 'module', isSystem: true, isActive: true },
      data: { isActive: false },
    });
  });
});

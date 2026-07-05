/**
 * `syncFrameworkCapabilities` (f-slot-capture t-1) — the `ai_capability` metadata sync.
 *
 * No live DB: `executeTransaction` forwards to a small STATEFUL in-memory `aiCapability`
 * fake so create → update-on-change → deactivate-removed run against a coherent store.
 * `getRegisteredFrameworkCapabilities` is mocked to control the desired set. Proves the
 * framework-owned rows are created/propagated/deactivated by this sync's own
 * `metadata.framework` stamp, and the dispatcher cache is cleared only on change.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AiCapability } from '@prisma/client';

const { store, prismaFake, resetStore, seedRow } = vi.hoisted(() => {
  const rows = new Map<string, AiCapability>();
  const matchesFindMany = (
    r: AiCapability,
    where: { slug?: { in?: string[] }; metadata?: { path?: string[]; equals?: unknown } }
  ): boolean => {
    if (where.slug?.in !== undefined && !where.slug.in.includes(r.slug)) return false;
    if (where.metadata) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      if (meta.framework !== where.metadata.equals) return false;
    }
    return true;
  };
  const matchesUpdateMany = (
    r: AiCapability,
    where: {
      metadata?: { path?: string[]; equals?: unknown };
      isActive?: boolean;
      slug?: { notIn?: string[] };
    }
  ): boolean => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (where.metadata && meta.framework !== where.metadata.equals) return false;
    if (where.isActive !== undefined && r.isActive !== where.isActive) return false;
    if (where.slug?.notIn && where.slug.notIn.includes(r.slug)) return false;
    return true;
  };
  const prismaFake = {
    aiCapability: {
      findMany: async (args: { where: { slug?: { in?: string[] } } }) =>
        [...rows.values()].filter((r) => matchesFindMany(r, args.where)).map((r) => ({ ...r })),
      createMany: async (args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const d of args.data) {
          if (args.skipDuplicates && rows.has(String(d.slug))) continue;
          rows.set(String(d.slug), { isActive: true, ...d } as unknown as AiCapability);
          count++;
        }
        return { count };
      },
      update: async (args: { where: { slug: string }; data: Record<string, unknown> }) => {
        const r = rows.get(args.where.slug);
        if (!r) throw new Error(`no capability ${args.where.slug}`);
        Object.assign(r, args.data);
        return { ...r };
      },
      updateMany: async (args: {
        where: Parameters<typeof matchesUpdateMany>[1];
        data: { isActive?: boolean };
      }) => {
        let count = 0;
        for (const r of rows.values()) {
          if (matchesUpdateMany(r, args.where)) {
            Object.assign(r, args.data);
            count++;
          }
        }
        return { count };
      },
    },
  };
  return {
    store: rows,
    prismaFake,
    resetStore: () => rows.clear(),
    seedRow: (r: Partial<AiCapability> & { slug: string }) =>
      rows.set(r.slug, {
        name: r.slug,
        isActive: true,
        metadata: { framework: 'framework-builtin' },
        ...r,
      } as unknown as AiCapability),
  };
});

vi.mock('@/lib/db/client', () => ({ prisma: prismaFake }));
vi.mock('@/lib/db/utils', () => ({
  executeTransaction: async (cb: (tx: typeof prismaFake) => Promise<unknown>) => cb(prismaFake),
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const { clearCache } = vi.hoisted(() => ({ clearCache: vi.fn() }));
vi.mock('@/lib/orchestration/capabilities/dispatcher', () => ({
  capabilityDispatcher: { clearCache },
}));
vi.mock('@/lib/framework/capabilities/registry', () => ({
  getRegisteredFrameworkCapabilities: vi.fn(),
}));

import { syncFrameworkCapabilities } from '@/lib/framework/capabilities/sync';
import { getRegisteredFrameworkCapabilities } from '@/lib/framework/capabilities/registry';

const capStub = (slug: string, description = 'read') =>
  ({
    slug,
    functionDefinition: { name: slug, description, parameters: { type: 'object' } },
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  vi.mocked(getRegisteredFrameworkCapabilities).mockReturnValue([capStub('get_state')]);
});

describe('syncFrameworkCapabilities', () => {
  it('creates a framework-owned ai_capability row for a new capability, and clears the cache', async () => {
    await syncFrameworkCapabilities();
    const row = store.get('get_state');
    expect(row).toMatchObject({
      slug: 'get_state',
      category: 'framework',
      executionType: 'internal',
      executionHandler: 'framework-builtin:get_state',
      isSystem: true,
      isActive: true,
      metadata: { framework: 'framework-builtin' },
    });
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('propagates a code change (description) to an existing row', async () => {
    seedRow({
      slug: 'get_state',
      description: 'stale',
      executionHandler: 'framework-builtin:get_state',
      functionDefinition: {
        name: 'get_state',
        description: 'stale',
        parameters: { type: 'object' },
      },
    });
    vi.mocked(getRegisteredFrameworkCapabilities).mockReturnValue([capStub('get_state', 'fresh')]);
    await syncFrameworkCapabilities();
    expect(store.get('get_state')?.description).toBe('fresh');
  });

  it('is a no-op (no cache clear) when the row already matches', async () => {
    seedRow({
      slug: 'get_state',
      description: 'read',
      executionHandler: 'framework-builtin:get_state',
      functionDefinition: {
        name: 'get_state',
        description: 'read',
        parameters: { type: 'object' },
      },
    });
    await syncFrameworkCapabilities();
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('deactivates a removed framework built-in, but never touches a foreign row', async () => {
    seedRow({
      slug: 'get_state',
      description: 'read',
      executionHandler: 'framework-builtin:get_state',
      functionDefinition: {
        name: 'get_state',
        description: 'read',
        parameters: { type: 'object' },
      },
    });
    seedRow({ slug: 'retired_tool', metadata: { framework: 'framework-builtin' } });
    seedRow({ slug: 'a_module_tool', metadata: { framework: 'module-capability' } });

    await syncFrameworkCapabilities();

    expect(store.get('retired_tool')?.isActive).toBe(false); // ours, gone from the list
    expect(store.get('a_module_tool')?.isActive).toBe(true); // not our stamp — untouched
  });

  it('skips entirely (no cache clear) when nothing is registered', async () => {
    vi.mocked(getRegisteredFrameworkCapabilities).mockReturnValue([]);
    await syncFrameworkCapabilities();
    expect(store.size).toBe(0);
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('never hijacks a foreign row that shares a bare slug (marker-scoped reconcile)', async () => {
    // A Sunrise built-in (no framework marker) happens to own the slug. The sync must
    // leave it entirely alone — not overwrite its handler/description or force it active.
    seedRow({
      slug: 'get_state',
      description: 'a core built-in that got there first',
      executionHandler: 'core:get_state',
      isActive: false,
      metadata: {},
    });
    await syncFrameworkCapabilities();
    const row = store.get('get_state');
    expect(row?.description).toBe('a core built-in that got there first');
    expect(row?.executionHandler).toBe('core:get_state');
    expect(row?.isActive).toBe(false); // not force-activated
  });
});

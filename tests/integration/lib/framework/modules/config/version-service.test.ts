/**
 * Module config version service (f-module-config t-1).
 *
 * Exercises the real save/restore/list/get logic against a small STATEFUL in-memory
 * Prisma fake — `create`/`update` mutate a store and the finders read it back, so version
 * monotonicity, the lazy initial-version seed, the live-config write, and restore-forward
 * are proven for real rather than asserted call-by-call (house style: no live DB in
 * vitest). The `configSchema` is a genuine Zod schema via a mocked registry, so A4
 * validation (reject / apply-defaults / re-validate-on-restore) is real. The HTTP
 * contract over these functions is t-2.
 *
 * @see lib/framework/modules/config/version-service.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// ─── Stateful in-memory Prisma fake ──────────────────────────────────────────
const { prismaFake, resetStore, seedModule } = vi.hoisted(() => {
  const store = {
    modules: new Map<string, any>(),
    versions: new Map<string, any>(),
    seq: 0,
  };
  const id = (p: string) => `${p}${(store.seq += 1)}`;

  function findModule(where: any): any {
    if (where.id) return store.modules.get(where.id) ?? null;
    if (where.slug) {
      for (const m of store.modules.values()) if (m.slug === where.slug) return m;
    }
    return null;
  }

  function findVersion(where: any): any {
    if (where.id) return store.versions.get(where.id) ?? null;
    if (where.moduleId_version) {
      const { moduleId, version } = where.moduleId_version;
      for (const v of store.versions.values())
        if (v.moduleId === moduleId && v.version === version) return v;
    }
    return null;
  }

  const moduleFake = {
    findUnique: async ({ where }: any) => {
      const row = findModule(where);
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: any) => {
      const row = findModule(where);
      if (!row) throw new Error('not found');
      if ('config' in data) row.config = data.config;
      return { ...row };
    },
  };

  const version = {
    create: async ({ data }: any) => {
      const row = { id: id('v'), createdAt: new Date(0), changeSummary: null, ...data };
      store.versions.set(row.id, row);
      return { ...row };
    },
    findFirst: async ({ where, orderBy }: any) => {
      let rows = [...store.versions.values()].filter((v) => v.moduleId === where.moduleId);
      if (orderBy?.version === 'desc') rows = rows.sort((a, b) => b.version - a.version);
      return rows[0] ? { ...rows[0] } : null;
    },
    findUnique: async ({ where }: any) => {
      const row = findVersion(where);
      return row ? { ...row } : null;
    },
    findMany: async ({ where, orderBy, take, cursor, skip }: any) => {
      let rows = [...store.versions.values()].filter((v) => v.moduleId === where.moduleId);
      if (orderBy?.version === 'desc') rows = rows.sort((a, b) => b.version - a.version);
      if (cursor) {
        const idx = rows.findIndex((r) => r.id === cursor.id);
        if (idx >= 0) rows = rows.slice(idx + (skip ?? 0));
      }
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    },
  };

  const prismaFake = {
    module: moduleFake,
    moduleVersion: version,
    // The service only opens single-module transactions; run the callback against
    // the same fake so its writes land in the shared store.
    $transaction: async (fn: any) => fn(prismaFake),
  };

  return {
    prismaFake,
    resetStore: () => {
      store.modules.clear();
      store.versions.clear();
      store.seq = 0;
    },
    /** Insert a `framework_module` row (the service reads/updates but never creates it). */
    seedModule: (slug: string, config: unknown = {}): string => {
      const rowId = `m-${slug}`;
      store.modules.set(rowId, { id: rowId, slug, name: `Module ${slug}`, config });
      return rowId;
    },
  };
});

vi.mock('@/lib/db/client', () => ({ prisma: prismaFake }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/framework/modules/registry', () => ({ getRegisteredModule: vi.fn() }));

import {
  saveModuleConfig,
  restoreModuleVersion,
  listModuleVersions,
  getModuleVersion,
  INITIAL_VERSION_SUMMARY,
} from '@/lib/framework/modules/config/version-service';
import { getRegisteredModule } from '@/lib/framework/modules/registry';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const USER = 'user-1';

/** The module's config schema used across tests: an enum + a defaulted number. */
const configSchema = z.object({
  tone: z.enum(['gentle', 'direct']).default('gentle'),
  sessions: z.number().int().min(1).default(3),
});

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.mocked(getRegisteredModule).mockReturnValue({
    slug: 'reading',
    name: 'Reading',
    description: 'test',
    configSchema,
  });
});

describe('saveModuleConfig', () => {
  it('throws NotFoundError for an unknown slug', async () => {
    await expect(saveModuleConfig({ slug: 'ghost', config: {}, userId: USER })).rejects.toThrow(
      NotFoundError
    );
  });

  it('throws ValidationError when the module is unregistered (no schema)', async () => {
    seedModule('reading');
    vi.mocked(getRegisteredModule).mockReturnValueOnce(undefined);
    await expect(
      saveModuleConfig({ slug: 'reading', config: { tone: 'gentle' }, userId: USER })
    ).rejects.toThrow(ValidationError);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('rejects a config that fails the schema and writes nothing', async () => {
    seedModule('reading');
    await expect(
      saveModuleConfig({ slug: 'reading', config: { tone: 'shouty' }, userId: USER })
    ).rejects.toThrow(ValidationError);
    const { versions } = await listModuleVersions('reading');
    expect(versions).toHaveLength(0);
  });

  it('on first save seeds an initial v1 (pre-edit) then writes the save as v2', async () => {
    seedModule('reading', { tone: 'direct', sessions: 9 }); // pre-edit state
    const { version } = await saveModuleConfig({
      slug: 'reading',
      config: { tone: 'gentle', sessions: 5 },
      userId: USER,
      changeSummary: 'tuned',
    });
    expect(version.version).toBe(2);

    const { versions } = await listModuleVersions('reading');
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    const v1 = versions.find((v) => v.version === 1)!;
    expect(v1.changeSummary).toBe(INITIAL_VERSION_SUMMARY);
    expect(v1.snapshot).toEqual({ tone: 'direct', sessions: 9 }); // the pre-edit config
    const v2 = versions.find((v) => v.version === 2)!;
    expect(v2.snapshot).toEqual({ tone: 'gentle', sessions: 5 });
  });

  it('applies Zod defaults and stores the canonical parsed config on the live row', async () => {
    const id = seedModule('reading');
    await saveModuleConfig({ slug: 'reading', config: {}, userId: USER });
    const live = await prismaFake.module.findUnique({ where: { id } });
    expect(live.config).toEqual({ tone: 'gentle', sessions: 3 }); // defaults applied
  });

  it('numbers versions monotonically across saves', async () => {
    seedModule('reading');
    await saveModuleConfig({ slug: 'reading', config: { tone: 'gentle' }, userId: USER }); // seeds v1 + v2
    const second = await saveModuleConfig({
      slug: 'reading',
      config: { tone: 'direct' },
      userId: USER,
    });
    expect(second.version.version).toBe(3);
    const { versions } = await listModuleVersions('reading');
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it('audits module_config.save with the version transition', async () => {
    seedModule('reading');
    await saveModuleConfig({ slug: 'reading', config: { tone: 'gentle' }, userId: USER });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'module_config.save',
        entityType: 'module_config',
        changes: { config: { from: 1, to: 2 } },
      })
    );
  });
});

describe('restoreModuleVersion', () => {
  it('throws NotFoundError for an unknown version', async () => {
    seedModule('reading');
    await expect(
      restoreModuleVersion({ slug: 'reading', version: 99, userId: USER })
    ).rejects.toThrow(NotFoundError);
  });

  it('restores a prior snapshot forward as a new version and updates the live config', async () => {
    const id = seedModule('reading');
    await saveModuleConfig({
      slug: 'reading',
      config: { tone: 'gentle', sessions: 2 },
      userId: USER,
    }); // v1 seed + v2
    await saveModuleConfig({
      slug: 'reading',
      config: { tone: 'direct', sessions: 8 },
      userId: USER,
    }); // v3

    const { version } = await restoreModuleVersion({ slug: 'reading', version: 2, userId: USER });
    expect(version.version).toBe(4);
    expect(version.changeSummary).toBe('Restore to v2');
    expect(version.snapshot).toEqual({ tone: 'gentle', sessions: 2 });

    const live = await prismaFake.module.findUnique({ where: { id } });
    expect(live.config).toEqual({ tone: 'gentle', sessions: 2 });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'module_config.restore',
        metadata: expect.objectContaining({ restoredFromVersion: 2 }),
      })
    );
  });

  it('rejects restoring a snapshot that no longer validates against the current schema', async () => {
    seedModule('reading');
    await saveModuleConfig({ slug: 'reading', config: { tone: 'gentle' }, userId: USER }); // v1 seed + v2

    // The module's schema tightens: `tone` now must be 'formal' only — the old snapshot
    // ('gentle') no longer parses.
    vi.mocked(getRegisteredModule).mockReturnValue({
      slug: 'reading',
      name: 'Reading',
      description: 'test',
      configSchema: z.object({ tone: z.enum(['formal']) }),
    });

    await expect(
      restoreModuleVersion({ slug: 'reading', version: 2, userId: USER })
    ).rejects.toThrow(ValidationError);
  });
});

describe('listModuleVersions / getModuleVersion', () => {
  beforeEach(async () => {
    seedModule('reading');
    // seeds v1 + v2, then v3, v4
    await saveModuleConfig({ slug: 'reading', config: { tone: 'gentle' }, userId: USER });
    await saveModuleConfig({ slug: 'reading', config: { tone: 'direct' }, userId: USER });
    await saveModuleConfig({ slug: 'reading', config: { tone: 'gentle' }, userId: USER });
  });

  it('lists newest first', async () => {
    const { versions } = await listModuleVersions('reading');
    expect(versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
  });

  it('paginates with a stable id cursor', async () => {
    const page1 = await listModuleVersions('reading', { limit: 2 });
    expect(page1.versions.map((v) => v.version)).toEqual([4, 3]);
    expect(page1.nextCursor).toBe(page1.versions[1].id);

    const page2 = await listModuleVersions('reading', { limit: 2, cursor: page1.nextCursor! });
    expect(page2.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(page2.nextCursor).toBeNull();
  });

  it('gets a single version by number, or 404s', async () => {
    const v3 = await getModuleVersion('reading', 3);
    expect(v3.version).toBe(3);
    await expect(getModuleVersion('reading', 42)).rejects.toThrow(NotFoundError);
  });
});

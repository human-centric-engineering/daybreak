/**
 * Module config version service (f-module-config t-1) — the only module that writes
 * `framework_module_version` rows or mutates `framework_module.config`.
 *
 * The **point-in-time** cousin of the f-map version service
 * (`lib/framework/facilitation/map/version-service.ts`): a module's live config is the
 * `Module.config` column, and every operator save both writes that column and snapshots
 * a `ModuleVersion` capturing the config *as of* the save (the `AiAgentVersion` model —
 * A10). So the newest version always equals the live config, and "rollback" is a
 * **restore**: copy a prior snapshot back onto `Module.config` and snapshot it forward
 * as a new version (history is never rewound). There is no draft buffer / published
 * pointer — config is a fill-and-save form (f-module-config.md reconciliation 1).
 *
 * A config write is validated against the **registered** module's `configSchema` (A4),
 * read from the in-memory registry by slug — so a module whose code was removed
 * (unregistered) cannot be edited (there is no schema to validate against), though its
 * history stays readable. `createdBy` has no Prisma relation (X6 keeps a reverse field
 * off the core `User` model), so its FK lives in the migration SQL. Every write emits a
 * `logAdminAction` audit entry (spec §7).
 */

import { Prisma } from '@prisma/client';
import type { ModuleVersion } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { getRegisteredModule } from '@/lib/framework/modules/registry';

type Tx = Prisma.TransactionClient;

const ENTITY_TYPE = 'module_config';

/** Change summary for the explicit original version seeded on a module's first save. */
export const INITIAL_VERSION_SUMMARY = 'Initial configuration';

// ─── Internal helpers ────────────────────────────────────────────────────────

interface ResolvedModule {
  id: string;
  name: string;
  config: Prisma.JsonValue;
}

/** Resolve a module row (id, name, live config) from its slug, or 404. */
async function loadModule(slug: string): Promise<ResolvedModule> {
  const row = await prisma.module.findUnique({
    where: { slug },
    select: { id: true, name: true, config: true },
  });
  if (!row) throw new NotFoundError(`Module "${slug}" not found`);
  return row;
}

/**
 * Validate a config value against the registered module's `configSchema` (A4), or throw
 * `ValidationError`. A module with no registered definition (code removed) cannot be
 * validated, so editing it is rejected — the schema is the contract. Returns the parsed
 * value (Zod applies defaults / strips unknowns), which is what gets stored so the row
 * is always the schema's canonical form.
 */
function validateAgainstSchema(slug: string, config: unknown): Prisma.InputJsonValue {
  const def = getRegisteredModule(slug);
  if (!def) {
    throw new ValidationError('Module is not registered — its config cannot be edited', {
      slug: [`Module "${slug}" has no registered definition (code removed)`],
    });
  }
  const parsed = def.configSchema.safeParse(config);
  if (!parsed.success) {
    throw new ValidationError('Module config is invalid', {
      config: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    });
  }
  return parsed.data as Prisma.InputJsonValue;
}

/** Highest existing version for a module + 1 (or 1 if none). Call inside the write tx
 *  so concurrent writers can't collide on `@@unique([moduleId, version])`. */
async function nextVersionNumber(client: Tx, moduleId: string): Promise<number> {
  const row = await client.moduleVersion.findFirst({
    where: { moduleId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (row?.version ?? 0) + 1;
}

/**
 * Seed an explicit v1 capturing the module's *pre-edit* config when it has no versions
 * yet, so the original state is a first-class, restorable entry (the `AiAgentVersion`
 * create-time seed, done lazily here because a module row is created by boot-sync, not
 * through this service). The seed snapshot is stored as-is (it predates this feature's
 * validation) — restore re-validates before it is ever reinstated. Returns the next
 * free version number after seeding (2 when seeded, else the original `next`).
 */
async function seedInitialVersionIfNeeded(
  tx: Tx,
  moduleId: string,
  next: number,
  currentConfig: Prisma.JsonValue,
  userId: string
): Promise<number> {
  if (next !== 1) return next;
  await tx.moduleVersion.create({
    data: {
      moduleId,
      version: 1,
      snapshot: currentConfig ?? {},
      changeSummary: INITIAL_VERSION_SUMMARY,
      createdBy: userId,
    },
  });
  return 2;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface SaveModuleConfigArgs {
  slug: string;
  /** The operator's config values — validated against the module's `configSchema`. */
  config: unknown;
  userId: string;
  changeSummary?: string;
  clientIp?: string | null;
}

export interface SaveModuleConfigResult {
  version: ModuleVersion;
}

/**
 * Validate an operator's config against the registered module's schema, write it to
 * `Module.config`, and snapshot a new `ModuleVersion` — atomically. On a module's first
 * save, an explicit v1 capturing the pre-edit config is seeded first (so it stays
 * restorable) and the save becomes v2. Throws `ValidationError` when the module is
 * unregistered or the config fails its schema; `NotFoundError` when the slug is unknown.
 */
export async function saveModuleConfig(
  args: SaveModuleConfigArgs
): Promise<SaveModuleConfigResult> {
  const { slug, config, userId, changeSummary, clientIp } = args;
  const mod = await loadModule(slug);

  // Validate before opening the transaction — a bad config writes nothing.
  const validated = validateAgainstSchema(slug, config);

  const version = await prisma.$transaction(async (tx) => {
    const next = await nextVersionNumber(tx, mod.id);
    const versionNumber = await seedInitialVersionIfNeeded(tx, mod.id, next, mod.config, userId);
    const created = await tx.moduleVersion.create({
      data: {
        moduleId: mod.id,
        version: versionNumber,
        snapshot: validated,
        changeSummary: changeSummary ?? null,
        createdBy: userId,
      },
    });
    await tx.module.update({ where: { id: mod.id }, data: { config: validated } });
    return created;
  });

  logAdminAction({
    userId,
    action: 'module_config.save',
    entityType: ENTITY_TYPE,
    entityId: mod.id,
    entityName: mod.name,
    changes: { config: { from: version.version - 1, to: version.version } },
    metadata: { slug, ...(changeSummary ? { changeSummary } : {}) },
    clientIp: clientIp ?? null,
  });

  return { version };
}

export interface RestoreModuleVersionArgs {
  slug: string;
  /** Version NUMBER to restore (not a row id). */
  version: number;
  userId: string;
  clientIp?: string | null;
}

/**
 * Restore a prior config version by re-validating its snapshot against the module's
 * *current* schema, writing it back to `Module.config`, and snapshotting it forward as a
 * new version — history is never rewound. Re-validation guards the case where the schema
 * changed since the snapshot was taken (an old shape that no longer parses is rejected
 * rather than reinstated). Throws `NotFoundError` for an unknown slug/version,
 * `ValidationError` when the module is unregistered or the snapshot no longer validates.
 */
export async function restoreModuleVersion(
  args: RestoreModuleVersionArgs
): Promise<SaveModuleConfigResult> {
  const { slug, version, userId, clientIp } = args;
  const mod = await loadModule(slug);

  const target = await prisma.moduleVersion.findUnique({
    where: { moduleId_version: { moduleId: mod.id, version } },
  });
  if (!target) {
    throw new NotFoundError(`Module "${slug}" has no version ${version}`);
  }

  // Re-validate the historical snapshot against the schema as it stands now.
  const validated = validateAgainstSchema(slug, target.snapshot);

  const created = await prisma.$transaction(async (tx) => {
    const next = await nextVersionNumber(tx, mod.id);
    const row = await tx.moduleVersion.create({
      data: {
        moduleId: mod.id,
        version: next,
        snapshot: validated,
        changeSummary: `Restore to v${version}`,
        createdBy: userId,
      },
    });
    await tx.module.update({ where: { id: mod.id }, data: { config: validated } });
    return row;
  });

  logAdminAction({
    userId,
    action: 'module_config.restore',
    entityType: ENTITY_TYPE,
    entityId: mod.id,
    entityName: mod.name,
    changes: { config: { from: created.version - 1, to: created.version } },
    metadata: { slug, restoredFromVersion: version },
    clientIp: clientIp ?? null,
  });

  return { version: created };
}

export interface ListModuleVersionsOptions {
  limit?: number;
  cursor?: string;
}

export interface ListModuleVersionsResult {
  versions: ModuleVersion[];
  nextCursor: string | null;
}

/**
 * Paginated version list, newest first. `cursor` is the id of the last version on the
 * previous page (versions are immutable, so an id cursor is stable). The newest version
 * is always the live config (no draft/published split), so a consumer flags `versions[0]`
 * as current without a pointer.
 */
export async function listModuleVersions(
  slug: string,
  opts: ListModuleVersionsOptions = {}
): Promise<ListModuleVersionsResult> {
  const mod = await loadModule(slug);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const versions = await prisma.moduleVersion.findMany({
    where: { moduleId: mod.id },
    orderBy: { version: 'desc' },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = versions.length > limit;
  const page = hasMore ? versions.slice(0, limit) : versions;
  return {
    versions: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** A single immutable version by number, for diff / detail views. */
export async function getModuleVersion(slug: string, version: number): Promise<ModuleVersion> {
  const mod = await loadModule(slug);
  const row = await prisma.moduleVersion.findUnique({
    where: { moduleId_version: { moduleId: mod.id, version } },
  });
  if (!row) throw new NotFoundError(`Module "${slug}" has no version ${version}`);
  return row;
}

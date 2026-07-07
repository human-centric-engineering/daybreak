/**
 * Module settings write service (f-ops-views t-3) — the only module that mutates a
 * module's operator-controlled lifecycle columns (`status`, `audience`, `featureFlagName`,
 * the availability window, display `name`) or hard-deletes a module row.
 *
 * The lifecycle complement to `config/version-service.ts` (which owns `Module.config` +
 * `ModuleVersion`): those are the schema-validated *value bag*; this owns the *lifecycle*
 * around it. Both start from `getModuleSettings` (the shared slug→row load) and both audit
 * every write via `logAdminAction` (spec §7).
 *
 * Delete is deliberately narrow: only an **unregistered** module (code already removed) can
 * be hard-deleted. A registered module's row is code-owned — boot-sync recreates it on next
 * start — so deleting it would only destroy its config/version history and then reappear
 * empty; operators turn a live module off by *retiring* it (a status PATCH), not deleting.
 * A hard delete cascades to the module's version history, agent bindings, and knowledge
 * scope, which shrinks the effective document access of previously-bound agents — so it
 * clears the knowledge-access resolver cache (`invalidateAllAgentAccess`, the documented
 * coarse/bulk path) to stop a stale, wider access set from lingering for the cache TTL.
 */

import { prisma } from '@/lib/db/client';
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { invalidateAllAgentAccess } from '@/lib/orchestration/knowledge/resolveAgentDocumentAccess';
import { mapPrismaWriteError } from '@/lib/framework/shared/prisma-errors';
import {
  getModuleSettings,
  MODULE_SETTINGS_SELECT,
  type ModuleSettings,
} from '@/lib/framework/modules/queries';

const ENTITY_TYPE = 'module';

/** Normalise a settings value for a stable audit diff (a `Date` → its ISO string). */
function auditValue(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : v;
}

/**
 * A partial update of the operator-editable columns. Only present keys are written (PATCH
 * semantics); `featureFlagName` / the window bounds accept `null` to *clear* them. The
 * route coerces the ISO-string window bounds to `Date` before calling this.
 */
export interface ModuleSettingsPatch {
  name?: string;
  status?: string;
  audience?: string;
  featureFlagName?: string | null;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
}

export interface UpdateModuleSettingsArgs {
  slug: string;
  patch: ModuleSettingsPatch;
  userId: string;
  clientIp?: string | null;
}

/**
 * Update a module's lifecycle settings and return the fresh row. Throws `NotFoundError`
 * for an unknown slug, and `ValidationError` when the *merged* availability window is
 * incoherent (`availableFrom` after `availableUntil`) — checked here, not in the request
 * schema, because a PATCH may set only one bound and the other comes from the current row.
 * Audits only the fields whose value actually changes (a re-submit of identical values is a
 * no-op that writes no audit entry).
 */
export async function updateModuleSettings(
  args: UpdateModuleSettingsArgs
): Promise<ModuleSettings> {
  const { slug, patch, userId, clientIp } = args;
  const current = await getModuleSettings(slug);

  // Window coherence against the merged row (patched bound if sent, else the current one).
  const from = 'availableFrom' in patch ? patch.availableFrom : current.availableFrom;
  const until = 'availableUntil' in patch ? patch.availableUntil : current.availableUntil;
  if (from && until && from.getTime() > until.getTime()) {
    throw new ValidationError('Availability window is invalid', {
      availableUntil: ['Must be on or after the availability start'],
    });
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch) as (keyof ModuleSettingsPatch)[]) {
    const before = auditValue(current[key]);
    const after = auditValue(patch[key]);
    if (before !== after) changes[key] = { from: before, to: after };
  }

  const updated = await prisma.module.update({
    where: { id: current.id },
    data: patch,
    select: MODULE_SETTINGS_SELECT,
  });

  if (Object.keys(changes).length > 0) {
    logAdminAction({
      userId,
      action: 'module.update',
      entityType: ENTITY_TYPE,
      entityId: current.id,
      entityName: updated.name,
      changes,
      metadata: { slug },
      clientIp: clientIp ?? null,
    });
  }

  return updated;
}

export interface DeleteModuleArgs {
  slug: string;
  userId: string;
  clientIp?: string | null;
}

/**
 * Hard-delete an **unregistered** module row (and, by cascade, its version history, agent
 * bindings, and knowledge scope). Throws `NotFoundError` for an unknown slug and
 * `ConflictError` (409) when the module is still registered — a registered module is turned
 * off by retiring it, not deleted, since boot-sync would recreate its row anyway. Clears the
 * knowledge-access resolver cache after the cascade so a previously-bound agent's stale
 * (wider) access set can't outlive the delete.
 */
export async function deleteModule(args: DeleteModuleArgs): Promise<void> {
  const { slug, userId, clientIp } = args;
  const current = await getModuleSettings(slug);

  if (current.isRegistered) {
    throw new ConflictError(
      'A registered module cannot be deleted — retire it, or remove its code first (which unregisters it).',
      { slug: [`Module "${slug}" is still registered`] }
    );
  }

  try {
    await prisma.module.delete({ where: { id: current.id } });
  } catch (err) {
    // A concurrent double-delete (the row went between load and delete) → clean 404, not a
    // raw P2025 500 — the realistic trigger is a double-clicked Delete button.
    mapPrismaWriteError(err, { notFound: `Module "${slug}" not found` });
  }

  // The cascade removed the module's knowledge scope, which every previously-bound agent
  // inherited via the live `resolveModuleKnowledgeForAgent` contributor. Those agents are
  // gone with the cascade (can't be enumerated for a per-agent eviction now), and a module
  // delete is exactly the coarse "schema-shaped change" the resolver documents this bulk
  // invalidation for — so clear the whole cache rather than risk a stale wider access set.
  invalidateAllAgentAccess();

  logAdminAction({
    userId,
    action: 'module.delete',
    entityType: ENTITY_TYPE,
    entityId: current.id,
    entityName: current.name,
    changes: null,
    metadata: { slug },
    clientIp: clientIp ?? null,
  });
}

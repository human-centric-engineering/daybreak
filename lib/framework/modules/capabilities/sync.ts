/**
 * Boot-time sync of module-declared capabilities into `ai_capability` rows
 * (f-module-bindings t-2, decision A8) — the metadata half that lets an agent be
 * granted a module tool the ordinary way (`AiAgentCapability` FKs to `ai_capability`).
 *
 * The framework OWNS a subset of the core `ai_capability` table: rows for module
 * capabilities, marked `category = "module"` + `isSystem = true`. That marker pair is
 * **admin-unreachable** — the admin create API neither accepts `isSystem` (default
 * `false`) nor a dotted slug (`slugSchema` forbids `.`), and the admin edit/delete
 * routes refuse to deactivate or delete an `isSystem` capability. So this sync can
 * safely reconcile its own rows without ever touching a built-in or admin-created one
 * (the B10 "partition the removal pass per write-source" discipline).
 *
 * Column ownership split (unlike a slot definition, which is a pure code projection):
 *   - **Code-projected** (this sync writes on create AND propagates on change): `name`,
 *     `description`, `functionDefinition`, `category`, `executionType`,
 *     `executionHandler`, `isSystem`, and `isActive` (fully sync-managed — admins can't
 *     toggle it on an `isSystem` row).
 *   - **Operator-owned** (written once on create, NEVER clobbered): `requiresApproval`,
 *     `rateLimit`, `approvalTimeoutMs`, `isIdempotent`, quarantine columns.
 *
 * The "did registration run?" guard keys on MODULES (a zero-module boot is a fluke —
 * a caught leaf-init error / HMR reset — so skip and never mass-deactivate), mirroring
 * `syncRegisteredModules` / `syncRegisteredSlotDefinitions`. A module registered with
 * zero capabilities is normal and must still reconcile (that is how removing a
 * module's last tool deactivates its row).
 */

import type { AiCapability } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { executeTransaction } from '@/lib/db/utils';
import { logger } from '@/lib/logging';
import { getRegisteredModules } from '@/lib/framework/modules/registry';
import type { CapabilityFunctionDefinition } from '@/lib/orchestration/capabilities/types';
import { capabilityDispatcher } from '@/lib/orchestration/capabilities/dispatcher';
import { moduleCapabilityIdentity } from '@/lib/framework/modules/capabilities/namespace';
import type { ModuleCapabilityRegistration } from '@/lib/framework/modules/capabilities/register';

/** Timeout (ms) for the sync transaction — a ceiling above Prisma's 5s default (#368). */
const SYNC_TX_TIMEOUT_MS = 20_000;

/** The category marker on a framework-owned capability row (admin list bucket). */
const MODULE_CAPABILITY_CATEGORY = 'module';
/** Module capabilities dispatch in-process via the registry handler. */
const MODULE_CAPABILITY_EXECUTION_TYPE = 'internal';
/**
 * The framework's own stamp on the rows it writes. The deactivate pass scopes on THIS
 * marker (a `metadata.framework` key only this sync ever sets) rather than on
 * `category`/`isSystem`, so the reconcile depends on the framework's own write, not on
 * an invariant enforced in distant files (the admin schema omitting `isSystem`). Even
 * if a future change let an admin/importer produce `category='module' + isSystem`, this
 * pass would not touch it — it isn't stamped.
 */
const MODULE_CAPABILITY_MARKER = 'module-capability';

/** Deep, key-order-independent JSON string — `functionDefinition` is a `jsonb` column,
 *  and Postgres does not preserve key order, so a raw `JSON.stringify` diff would see a
 *  spurious change on every boot. Arrays keep their order (JSON-schema order matters). */
function canonicalJson(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, sortKeys(obj[k])])
      );
    }
    return v;
  };
  return JSON.stringify(sortKeys(value));
}

/** The code-projected columns this sync writes for a module capability's row. */
interface ModuleCapabilityRow {
  slug: string;
  name: string;
  description: string;
  functionDefinition: CapabilityFunctionDefinition;
  executionHandler: string;
}

/**
 * Project every registered module's capabilities to their `ai_capability` rows.
 * Namespaces each (validating the tool slug) and derives the row's code-owned
 * fields from the same `moduleCapabilityIdentity` the handler registration uses.
 * Deduped by namespaced slug — unique by construction, so a collision is an authoring
 * error (last wins, logged). Exported for unit testing.
 *
 * **Run the handler registration first, and pass it its result.** Since v1.3 Phase 1
 * t-1.2 the PII contract (`processesPii` ⇒ `redactProvenance()`) is enforced by core
 * inside `capabilityDispatcher.register()`, i.e. by `registerRegisteredModuleCapabilities()`
 * — not here. That pass is fail-soft, so it reports which capabilities it registered and
 * which it refused, and `syncRegisteredModuleCapabilities(registration)` reconciles rows
 * against that report: refused capabilities get no row and their existing row is
 * deactivated. Called without a report (a repair script, a re-sync route) the sync falls
 * back to the dispatcher's handler map and refuses to mass-deactivate on its say-so.
 */
export function collectRegisteredModuleCapabilities(): ModuleCapabilityRow[] {
  const bySlug = new Map<string, ModuleCapabilityRow>();

  for (const mod of getRegisteredModules()) {
    for (const capability of mod.capabilities ?? []) {
      // The SAME derivation `register.ts` uses for the handler key — the row's slug and
      // the handler key must be one string or the tool never dispatches. And the SAME
      // fail-soft treatment: `moduleCapabilityIdentity` throws on a slug that cannot
      // namespace, and letting that escape here would abandon the sync mid-boot and skip
      // every step after it — exactly the failure the register half was made fail-soft to
      // avoid.
      //
      // Logged, not swallowed. On the boot path the register half has already reported
      // this capability — a second line is cheap. On the standalone path (a repair script
      // or re-sync route calling the sync with no registration report) nothing else has,
      // and a silent skip would deactivate the capability's existing row through the
      // `notIn` pass with no explanation for the tool disappearing.
      let identity: ReturnType<typeof moduleCapabilityIdentity>;
      try {
        identity = moduleCapabilityIdentity(mod.slug, capability);
      } catch (err) {
        logger.error(
          'collectRegisteredModuleCapabilities: capability slug cannot be namespaced — no row',
          {
            moduleSlug: mod.slug,
            error: err instanceof Error ? err.message : String(err),
          }
        );
        continue;
      }
      const { slug, functionDefinition } = identity;
      if (bySlug.has(slug)) {
        logger.warn(
          'collectRegisteredModuleCapabilities: duplicate capability slug — last registration wins',
          { slug, moduleSlug: mod.slug }
        );
      }
      bySlug.set(slug, {
        slug,
        // No human display name on BaseCapability — the namespaced slug is the row's
        // name (admin sees `reading__save_worksheet`); the LLM sees functionDefinition.name.
        name: slug,
        description: functionDefinition.description,
        functionDefinition,
        // A STABLE identifier of the owning module + tool. NOT `constructor.name` —
        // minified server bundles mangle class names (and it feeds the diff below).
        executionHandler: `framework-module:${mod.slug}/${capability.slug}`,
      });
    }
  }

  return [...bySlug.values()];
}

/** Whether a row's code-projected fields (or its active flag) differ from desired. */
function moduleCapabilityNeedsUpdate(row: AiCapability, desired: ModuleCapabilityRow): boolean {
  if (!row.isActive) return true;
  return (
    row.name !== desired.name ||
    row.description !== desired.description ||
    row.executionHandler !== desired.executionHandler ||
    canonicalJson(row.functionDefinition) !== canonicalJson(desired.functionDefinition)
  );
}

export async function syncRegisteredModuleCapabilities(
  registration?: ModuleCapabilityRegistration
): Promise<void> {
  // "Did registration run?" — a question about MODULES: zero registered modules ⇒ a
  // fluke boot ⇒ skip, never mass-deactivate (same guard as the module/slot syncs).
  if (getRegisteredModules().length === 0) {
    logger.info('syncRegisteredModuleCapabilities: no registered modules — nothing to sync');
    return;
  }

  const declared = collectRegisteredModuleCapabilities();

  // Only capabilities whose handler actually registered get a row: a row for a refused
  // capability would advertise — and let an admin grant — a tool that can never dispatch.
  //
  // `registration` is the register pass's own report, which is why it is threaded in
  // rather than inferred. `capabilityDispatcher.has()` cannot distinguish "the register
  // pass never ran" from "every capability was refused", and those need OPPOSITE answers:
  // skip (a fluke boot must never mass-deactivate) versus deactivate every refused row.
  // It is also wrong across a re-boot in one process — the dispatcher's handler map is
  // `globalThis`-backed, so a capability refused on THIS boot can still show `has() ===
  // true` from the previous one.
  let rows: ModuleCapabilityRow[];
  if (registration) {
    const registeredSlugs = new Set(registration.registered);
    rows = declared.filter((row) => registeredSlugs.has(row.slug));
    if (registration.refused.length > 0) {
      logger.error(
        'syncRegisteredModuleCapabilities: deactivating rows for capabilities registration refused',
        {
          refused: registration.refused.map((r) => `${r.moduleSlug}/${r.capabilitySlug}`),
        }
      );
    }
  } else {
    // No report — this half was called on its own (a repair script, a re-sync route).
    // Fall back to the handler map, and refuse to mass-deactivate on its say-so: with no
    // report we cannot tell a refusal from a registration that never happened.
    rows = declared.filter((row) => capabilityDispatcher.has(row.slug));
    if (declared.length > 0 && rows.length === 0) {
      logger.error(
        'syncRegisteredModuleCapabilities: no declared capability has a registered handler and no registration report — skipping rather than mass-deactivating'
      );
      return;
    }
    if (rows.length < declared.length) {
      logger.error(
        'syncRegisteredModuleCapabilities: declared capabilities have no registered handler — deactivating their rows',
        { slugs: declared.filter((r) => !capabilityDispatcher.has(r.slug)).map((r) => r.slug) }
      );
    }
  }

  const slugs = rows.map((r) => r.slug);

  const counts = await executeTransaction(
    async (tx) => {
      const existing =
        slugs.length > 0 ? await tx.aiCapability.findMany({ where: { slug: { in: slugs } } }) : [];
      const bySlug = new Map(existing.map((row) => [row.slug, row]));

      // Create newly-declared capabilities — code fields + operator defaults + the
      // framework marker that scopes the deactivate pass below. Batched (createMany),
      // matching the sibling slot sync.
      const toCreate = rows.filter((desired) => !bySlug.has(desired.slug));
      if (toCreate.length > 0) {
        await tx.aiCapability.createMany({
          data: toCreate.map((desired) => ({
            slug: desired.slug,
            name: desired.name,
            description: desired.description,
            category: MODULE_CAPABILITY_CATEGORY,
            functionDefinition: desired.functionDefinition as unknown as Prisma.InputJsonValue,
            executionType: MODULE_CAPABILITY_EXECUTION_TYPE,
            executionHandler: desired.executionHandler,
            isSystem: true,
            isActive: true,
            metadata: { framework: MODULE_CAPABILITY_MARKER },
          })),
          skipDuplicates: true,
        });
      }
      const created = toCreate.length;

      // Propagate code edits (and re-activation) — only when changed, and only to the
      // code-projected columns, so operator edits (rateLimit, requiresApproval, …) survive.
      let updated = 0;
      for (const desired of rows) {
        const row = bySlug.get(desired.slug);
        if (!row) continue;
        if (moduleCapabilityNeedsUpdate(row, desired)) {
          await tx.aiCapability.update({
            where: { slug: desired.slug },
            data: {
              name: desired.name,
              description: desired.description,
              functionDefinition: desired.functionDefinition as unknown as Prisma.InputJsonValue,
              executionType: MODULE_CAPABILITY_EXECUTION_TYPE,
              executionHandler: desired.executionHandler,
              isActive: true,
            },
          });
          updated++;
        }
      }

      // Deactivate framework-owned rows whose code was removed (retain for audit).
      // Scoped to the framework's OWN `metadata.framework` stamp — a row this sync
      // wrote — so it can never touch a built-in or admin-created capability regardless
      // of their category/isSystem. `notIn` omitted when no module capabilities remain
      // (avoids `notIn: []`).
      const { count: deactivated } = await tx.aiCapability.updateMany({
        where: {
          metadata: { path: ['framework'], equals: MODULE_CAPABILITY_MARKER },
          isActive: true,
          ...(slugs.length > 0 ? { slug: { notIn: slugs } } : {}),
        },
        data: { isActive: false },
      });

      return { created, updated, deactivated };
    },
    { timeout: SYNC_TX_TIMEOUT_MS }
  );

  // If any row changed, invalidate the dispatcher's DB-registry cache so a request that
  // landed during the boot window (and cached a registry missing these rows) re-reads
  // instead of returning `capability_inactive` until the TTL expires. Skipped on a
  // steady-state no-op boot so we don't thrash a warm cache.
  if (counts.created + counts.updated + counts.deactivated > 0) {
    capabilityDispatcher.clearCache();
  }

  logger.info('syncRegisteredModuleCapabilities: framework module capabilities synced', {
    registered: slugs.length,
    ...counts,
  });
}

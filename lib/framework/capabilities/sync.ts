/**
 * Boot-time sync of framework built-in capabilities into `ai_capability` rows
 * (f-slot-capture t-1) — the metadata half that lets an agent be granted a framework
 * tool (`get_state`, `fill_slot`, later guidance tools) the ordinary way
 * (`AiAgentCapability` FKs to `ai_capability`). The handler half is
 * `registerFrameworkCapabilityHandlers` (registry.ts).
 *
 * A parallel of `modules/capabilities/sync.ts`, minus the `<module>__` namespacing: the
 * framework OWNS a subset of `ai_capability` — rows marked `category = "framework"`,
 * `isSystem = true`, and stamped `metadata.framework = "framework-builtin"`. The
 * deactivate pass scopes on **that stamp** (a marker only this sync sets — distinct from
 * the module sync's `"module-capability"`), so the two framework syncs never touch each
 * other's rows, nor a Sunrise built-in / admin-created capability (B10 — partition the
 * removal pass per write-source).
 *
 * Column ownership, as for module caps:
 *   - **Code-projected** (written on create, propagated on change): `name`, `description`,
 *     `functionDefinition`, `category`, `executionType`, `executionHandler`, `isSystem`,
 *     `isActive`.
 *   - **Operator-owned** (written once, never clobbered): `requiresApproval`, `rateLimit`,
 *     `approvalTimeoutMs`, `isIdempotent`, quarantine columns.
 */

import type { AiCapability } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { executeTransaction } from '@/lib/db/utils';
import { logger } from '@/lib/logging';
import type { CapabilityFunctionDefinition } from '@/lib/orchestration/capabilities/types';
import { capabilityDispatcher } from '@/lib/orchestration/capabilities/dispatcher';
import { getRegisteredFrameworkCapabilities } from '@/lib/framework/capabilities/registry';

/** Timeout (ms) for the sync transaction — a ceiling above Prisma's 5s default (#368). */
const SYNC_TX_TIMEOUT_MS = 20_000;

/** Admin list bucket for a framework built-in capability row. */
const FRAMEWORK_CAPABILITY_CATEGORY = 'framework';
/** Framework built-ins dispatch in-process via the registry handler. */
const FRAMEWORK_CAPABILITY_EXECUTION_TYPE = 'internal';
/** The framework's stamp on the rows this sync writes — the deactivate pass scopes on
 *  it, so it never touches a module row (`"module-capability"`), a Sunrise built-in, or
 *  an admin-created capability, regardless of their category/`isSystem`. */
const FRAMEWORK_CAPABILITY_MARKER = 'framework-builtin';

/** Deep, key-order-independent JSON string — `functionDefinition` is `jsonb` and Postgres
 *  does not preserve key order, so a raw `JSON.stringify` diff would see a spurious change
 *  every boot. Arrays keep order (JSON-schema order matters). */
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

/** The code-projected columns this sync writes for a framework capability's row. */
interface FrameworkCapabilityRow {
  slug: string;
  name: string;
  description: string;
  functionDefinition: CapabilityFunctionDefinition;
  executionHandler: string;
}

/** Project the registered framework capabilities to their `ai_capability` rows. The slug
 *  is the capability's own (no namespacing); the name is the slug (no display name on
 *  `BaseCapability` — the LLM sees `functionDefinition.name`); the handler is a stable id. */
export function collectFrameworkCapabilities(): FrameworkCapabilityRow[] {
  return getRegisteredFrameworkCapabilities().map((cap) => ({
    slug: cap.slug,
    name: cap.slug,
    description: cap.functionDefinition.description,
    functionDefinition: cap.functionDefinition,
    executionHandler: `${FRAMEWORK_CAPABILITY_MARKER}:${cap.slug}`,
  }));
}

/** Whether a row's code-projected fields (or its active flag) differ from desired. */
function frameworkCapabilityNeedsUpdate(
  row: AiCapability,
  desired: FrameworkCapabilityRow
): boolean {
  if (!row.isActive) return true;
  return (
    row.name !== desired.name ||
    row.description !== desired.description ||
    row.executionHandler !== desired.executionHandler ||
    canonicalJson(row.functionDefinition) !== canonicalJson(desired.functionDefinition)
  );
}

export async function syncFrameworkCapabilities(): Promise<void> {
  const rows = collectFrameworkCapabilities();

  // "Did registration run?" — zero registered framework capabilities means a fluke boot
  // (a caught init error / HMR reset), so skip rather than mass-deactivate the built-ins.
  // Trade-off (as in the module sync): a *genuine* drop to zero — removing the last
  // built-in from code — then leaves its `ai_capability` row lingering `isActive` with no
  // handler (a dispatch failure if granted, not a data leak). Accepted because the
  // framework always ships built-ins; the list only grows.
  if (rows.length === 0) {
    logger.info('syncFrameworkCapabilities: no framework capabilities registered — skipping');
    return;
  }

  const slugs = rows.map((r) => r.slug);

  const counts = await executeTransaction(
    async (tx) => {
      // Marker-scoped, exactly like the deactivate pass below: only rows THIS sync owns.
      // A pre-existing row sharing a bare slug (a future Sunrise built-in — those are
      // bare underscore-slugs like `read_user_memory` — or an admin row) is invisible
      // here, so the update loop can never hijack it; `createMany`'s `skipDuplicates`
      // then declines to create over it (the framework cap simply gets no row until the
      // collision is resolved, rather than silently repointing a foreign one).
      const existing = await tx.aiCapability.findMany({
        where: {
          slug: { in: slugs },
          metadata: { path: ['framework'], equals: FRAMEWORK_CAPABILITY_MARKER },
        },
      });
      const bySlug = new Map(existing.map((row) => [row.slug, row]));

      const toCreate = rows.filter((desired) => !bySlug.has(desired.slug));
      if (toCreate.length > 0) {
        await tx.aiCapability.createMany({
          data: toCreate.map((desired) => ({
            slug: desired.slug,
            name: desired.name,
            description: desired.description,
            category: FRAMEWORK_CAPABILITY_CATEGORY,
            functionDefinition: desired.functionDefinition as unknown as Prisma.InputJsonValue,
            executionType: FRAMEWORK_CAPABILITY_EXECUTION_TYPE,
            executionHandler: desired.executionHandler,
            isSystem: true,
            isActive: true,
            metadata: { framework: FRAMEWORK_CAPABILITY_MARKER },
          })),
          skipDuplicates: true,
        });
      }
      const created = toCreate.length;

      // Propagate code edits + re-activation, only when changed, only to code columns —
      // operator edits (rateLimit, requiresApproval, …) survive.
      let updated = 0;
      for (const desired of rows) {
        const row = bySlug.get(desired.slug);
        if (row === undefined) continue;
        if (frameworkCapabilityNeedsUpdate(row, desired)) {
          await tx.aiCapability.update({
            where: { slug: desired.slug },
            data: {
              name: desired.name,
              description: desired.description,
              functionDefinition: desired.functionDefinition as unknown as Prisma.InputJsonValue,
              executionType: FRAMEWORK_CAPABILITY_EXECUTION_TYPE,
              executionHandler: desired.executionHandler,
              isActive: true,
            },
          });
          updated++;
        }
      }

      // Deactivate framework built-in rows whose code was removed (retain for audit),
      // scoped to this sync's OWN stamp so it can't touch a module / built-in / admin row.
      const { count: deactivated } = await tx.aiCapability.updateMany({
        where: {
          metadata: { path: ['framework'], equals: FRAMEWORK_CAPABILITY_MARKER },
          isActive: true,
          slug: { notIn: slugs },
        },
        data: { isActive: false },
      });

      return { created, updated, deactivated };
    },
    { timeout: SYNC_TX_TIMEOUT_MS }
  );

  // Invalidate the dispatcher's DB-registry cache if anything changed, so a request that
  // landed during the boot window re-reads instead of returning `capability_inactive`.
  if (counts.created + counts.updated + counts.deactivated > 0) {
    capabilityDispatcher.clearCache();
  }

  logger.info('syncFrameworkCapabilities: framework built-in capabilities synced', {
    registered: slugs.length,
    ...counts,
  });
}

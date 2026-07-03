/**
 * Boot-time slot-definition sync — reconciles the slots declared by registered
 * modules into `framework_slot_definition` rows (spec §6.1: module-owned
 * definitions "upserted at registration").
 *
 * Called once at startup by `syncFramework()` (after every tier has registered its
 * modules), it collects each registered module's `slotDefinitions`, stamps
 * `scope = module:<module.slug>`, and reconciles the set into rows.
 *
 * **Why this differs from the module sync (`modules/sync.ts`).** A `framework_module`
 * row carries *operator*-owned columns (status, config, window), so module sync
 * seeds a row once (`createMany … skipDuplicates`) and never rewrites it. A
 * `framework_slot_definition` row has **no operator columns** — it is a pure
 * projection of code — so an authored edit (a changed `sensitivity`, which drives
 * downstream masking; a reworded `description`) *must* propagate to the row.
 * This sync therefore reads the current rows and reconciles fully:
 *
 * 1. **Create** rows for newly-declared slugs.
 * 2. **Update** rows whose code changed — guarded by a field diff, so a boot where
 *    nothing changed writes zero rows and never bumps `updatedAt` (the
 *    no-write-when-unchanged invariant). Re-declaring a previously-removed slug is
 *    just an update that flips `isActive` back to `true`.
 * 3. **Deactivate** rows whose code was removed (`isActive = false`, row retained
 *    for audit) — guarded by `isActive: true` so already-inactive rows aren't rewritten.
 *
 * **An empty set is a no-op, never a mass-deactivate** (same reasoning as module
 * sync: "no slots declared" is indistinguishable from "registration didn't run",
 * so the destructive `notIn` branch is skipped and never sees an empty list).
 *
 * Wrapped in one interactive transaction via `executeTransaction`; the `{ timeout }`
 * option (#368) gives headroom for the write set.
 */

import type { SlotDefinition } from '@prisma/client';
import { executeTransaction } from '@/lib/db/utils';
import { logger } from '@/lib/logging';
import { getRegisteredModules } from '@/lib/framework/modules/registry';
import {
  SLOT_VISIBILITY,
  SLOT_MODE,
  SLOT_DATA_TYPE,
  SLOT_SENSITIVITY,
  moduleSlotScope,
} from '@/lib/framework/data-slots/vocabulary';

/** Timeout (ms) for the sync transaction — a ceiling above Prisma's 5s default (#368). */
const SYNC_TX_TIMEOUT_MS = 20_000;

/**
 * The code-owned fields the sync writes to a row — everything except the DB-managed
 * `id`/`createdAt`/`updatedAt` and the sync-managed `isActive`. Resolved from a
 * `SlotDefinitionInput` with defaults applied, so it is directly comparable to a row.
 */
interface ResolvedSlotDefinition {
  slug: string;
  group: string;
  description: string;
  scope: string;
  visibility: string;
  mode: string;
  dataType: string;
  sensitivity: string;
  priorityWeight: number;
}

/**
 * Collect every registered module's `slotDefinitions`, resolve defaults, and stamp
 * `scope = module:<slug>`. Deduped by slug (a slot slug is globally unique, spec
 * §6.1); a collision across modules is an authoring error — last registration wins,
 * logged. Exported for unit testing of the collection/stamping step.
 */
export function collectRegisteredSlotDefinitions(): ResolvedSlotDefinition[] {
  const bySlug = new Map<string, ResolvedSlotDefinition>();

  for (const mod of getRegisteredModules()) {
    for (const input of mod.slotDefinitions ?? []) {
      if (bySlug.has(input.slug)) {
        logger.warn(
          'collectRegisteredSlotDefinitions: duplicate slot slug across modules — last registration wins',
          { slug: input.slug, moduleSlug: mod.slug }
        );
      }
      bySlug.set(input.slug, {
        slug: input.slug,
        group: input.group,
        description: input.description,
        scope: moduleSlotScope(mod.slug),
        visibility: input.visibility ?? SLOT_VISIBILITY.open,
        mode: input.mode ?? SLOT_MODE.targeted,
        dataType: input.dataType ?? SLOT_DATA_TYPE.text,
        sensitivity: input.sensitivity ?? SLOT_SENSITIVITY.standard,
        priorityWeight: input.priorityWeight ?? 0,
      });
    }
  }

  return [...bySlug.values()];
}

/** Whether a row's code-owned fields (or its active flag) differ from the resolved definition. */
function slotDefinitionNeedsUpdate(row: SlotDefinition, desired: ResolvedSlotDefinition): boolean {
  return (
    !row.isActive ||
    row.group !== desired.group ||
    row.description !== desired.description ||
    row.scope !== desired.scope ||
    row.visibility !== desired.visibility ||
    row.mode !== desired.mode ||
    row.dataType !== desired.dataType ||
    row.sensitivity !== desired.sensitivity ||
    row.priorityWeight !== desired.priorityWeight
  );
}

export async function syncRegisteredSlotDefinitions(): Promise<void> {
  const definitions = collectRegisteredSlotDefinitions();

  // Empty set ⇒ deliberate no-op (never mass-deactivate on a fluke-empty registry).
  if (definitions.length === 0) {
    logger.info('syncRegisteredSlotDefinitions: no registered slot definitions — nothing to sync');
    return;
  }

  const slugs = definitions.map((d) => d.slug);

  const counts = await executeTransaction(
    async (tx) => {
      const existing = await tx.slotDefinition.findMany({ where: { slug: { in: slugs } } });
      const bySlug = new Map(existing.map((row) => [row.slug, row]));

      // Create newly-declared slugs (all code-owned fields; `isActive` defaults true).
      const toCreate = definitions.filter((d) => !bySlug.has(d.slug));
      if (toCreate.length > 0) {
        await tx.slotDefinition.createMany({ data: toCreate, skipDuplicates: true });
      }

      // Propagate code edits (and re-activation) to existing rows — only when changed.
      let updated = 0;
      for (const desired of definitions) {
        const row = bySlug.get(desired.slug);
        if (!row) continue;
        if (slotDefinitionNeedsUpdate(row, desired)) {
          await tx.slotDefinition.update({
            where: { slug: desired.slug },
            data: { ...desired, isActive: true },
          });
          updated++;
        }
      }

      // Deactivate rows whose code was removed (retain for audit).
      const { count: deactivated } = await tx.slotDefinition.updateMany({
        where: { slug: { notIn: slugs }, isActive: true },
        data: { isActive: false },
      });

      return { created: toCreate.length, updated, deactivated };
    },
    { timeout: SYNC_TX_TIMEOUT_MS }
  );

  logger.info('syncRegisteredSlotDefinitions: framework slot definitions synced', {
    registered: slugs.length,
    ...counts,
  });
}

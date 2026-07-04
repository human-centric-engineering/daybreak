/**
 * Boot-time slot-definition sync — reconciles the slots declared by registered
 * modules into `framework_slot_definition` rows (spec §6.1: module-owned
 * definitions "upserted at registration").
 *
 * Called once at startup by `syncFramework()` (after every tier has registered its
 * modules), it collects each registered module's `slotDefinitions`, stamps
 * `scope = module:<module.slug>`, and reconciles that set into rows.
 *
 * **Why this differs from the module sync (`modules/sync.ts`).** A `framework_module`
 * row carries *operator*-owned columns (status, config, window), so module sync
 * seeds a row once (`createMany … skipDuplicates`) and never rewrites it. A
 * `framework_slot_definition` row has **no operator columns** — it is a pure
 * projection of code — so an authored edit (a changed `sensitivity`, which drives
 * downstream masking; a reworded `description`) *must* propagate. This sync reads
 * the current rows and reconciles fully:
 *
 * 1. **Create** rows for newly-declared slugs.
 * 2. **Update** rows whose code changed — guarded by a field diff, so a boot where
 *    nothing changed writes zero rows and never bumps `updatedAt` (the
 *    no-write-when-unchanged invariant). Re-declaring a previously-removed slug is
 *    just an update that flips `isActive` back to `true`.
 * 3. **Deactivate** module-owned rows whose code was removed (`isActive = false`,
 *    row retained for audit) — guarded by `isActive: true` so already-inactive rows
 *    aren't rewritten, and **scoped to `module:%` rows** so a global/facilitation
 *    slot (a different, schema-permitted source — see `definition.ts`) is never
 *    touched by the module sync.
 *
 * **The "did registration run?" guard keys on modules, not slots.** A booted app
 * with **zero registered modules** means registration didn't run (a caught leaf-init
 * error, an HMR reset), so we skip entirely and never mass-deactivate on a fluke —
 * the same protection module sync has. But a module registered with **zero slots**
 * is a *normal* state that must still reconcile: that is how removing a module's
 * *last* slot deactivates its row (an empty slot set is common even when
 * registration fully succeeded, so it must not short-circuit the deactivate pass).
 *
 * Wrapped in one interactive transaction via `executeTransaction`; the `{ timeout }`
 * option (#368) gives headroom for the write set.
 */

import type { SlotDefinition } from '@prisma/client';
import { executeTransaction } from '@/lib/db/utils';
import { logger } from '@/lib/logging';
import { getRegisteredModules } from '@/lib/framework/modules/registry';
import type { SlotDefinitionInput } from '@/lib/framework/data-slots/definition';
import {
  SLOT_VISIBILITY,
  SLOT_MODE,
  SLOT_DATA_TYPE,
  SLOT_SENSITIVITY,
  SLOT_SCOPE_MODULE_PREFIX,
  moduleSlotScope,
} from '@/lib/framework/data-slots/vocabulary';

/** Timeout (ms) for the sync transaction — a ceiling above Prisma's 5s default (#368). */
const SYNC_TX_TIMEOUT_MS = 20_000;

/**
 * A `SlotDefinitionInput` with every default resolved and `scope` stamped — the
 * exact set of code-owned columns the sync writes (everything except the DB-managed
 * `id`/`createdAt`/`updatedAt` and the sync-managed `isActive`). Derived from the
 * input type so a new slot column is added in one place (the input) and flows here,
 * to the create payload, and to the field diff automatically.
 */
type ResolvedSlotDefinition = Required<SlotDefinitionInput> & { scope: string };

/**
 * Collect every registered module's `slotDefinitions`, resolve defaults, and stamp
 * `scope = module:<slug>`. Deduped by slug — a slot slug is globally unique (spec
 * §6.1), so a repeat (within a module or across two) is an authoring error: the last
 * registration wins, logged with the module that supplied it.
 * Exported for unit testing of the collection/stamping step.
 */
export function collectRegisteredSlotDefinitions(): ResolvedSlotDefinition[] {
  const bySlug = new Map<string, ResolvedSlotDefinition>();

  for (const mod of getRegisteredModules()) {
    for (const input of mod.slotDefinitions ?? []) {
      if (bySlug.has(input.slug)) {
        logger.warn(
          'collectRegisteredSlotDefinitions: duplicate slot slug — last registration wins (slugs must be globally unique)',
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

/**
 * Whether a row's code-owned fields (or its active flag) differ from the resolved
 * definition. Iterates the resolved keys so a newly-added column is diffed
 * automatically — no hand-maintained field list to fall out of step.
 */
function slotDefinitionNeedsUpdate(row: SlotDefinition, desired: ResolvedSlotDefinition): boolean {
  if (!row.isActive) return true;
  return (Object.keys(desired) as (keyof ResolvedSlotDefinition)[]).some(
    (key) => row[key] !== desired[key]
  );
}

export async function syncRegisteredSlotDefinitions(): Promise<void> {
  // "Did registration run?" is a question about MODULES, not slots (see the file
  // header): zero registered modules ⇒ a fluke boot ⇒ skip, never mass-deactivate.
  if (getRegisteredModules().length === 0) {
    logger.info('syncRegisteredSlotDefinitions: no registered modules — nothing to sync');
    return;
  }

  const definitions = collectRegisteredSlotDefinitions();
  const slugs = definitions.map((d) => d.slug);

  const counts = await executeTransaction(
    async (tx) => {
      const existing =
        slugs.length > 0
          ? await tx.slotDefinition.findMany({ where: { slug: { in: slugs } } })
          : [];
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

      // Deactivate module-owned rows whose code was removed (retain for audit).
      // Scoped to `module:%` so non-module slots are never touched; the `notIn`
      // filter is omitted when no slugs remain (all module slots removed) so it
      // never degenerates to `notIn: []`.
      const { count: deactivated } = await tx.slotDefinition.updateMany({
        where: {
          isActive: true,
          scope: { startsWith: SLOT_SCOPE_MODULE_PREFIX },
          ...(slugs.length > 0 ? { slug: { notIn: slugs } } : {}),
        },
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

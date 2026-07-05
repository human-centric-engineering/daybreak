/**
 * Slot-definition read queries — the read side of `framework_slot_definition`.
 *
 * Separated from `sync.ts` (the boot-time write side) so admin/ops read surfaces
 * share one testable data function, mirroring `modules/queries.ts`. `SlotDefinition`
 * comes straight from the generated Prisma client — a framework model, not
 * re-exported through core `types/prisma.ts` (which stays free of framework
 * vocabulary per the X6 boundary).
 */

import type { SlotDefinition } from '@prisma/client';
import { prisma } from '@/lib/db/client';

/**
 * List every slot definition, ordered by slug. Includes rows flagged
 * `isActive = false` (code removed but retained for audit) — the read surface shows
 * the full picture and lets the caller filter. Errors propagate to the caller's
 * standard error handling; this does not swallow failures into an empty list.
 */
export async function listSlotDefinitions(): Promise<SlotDefinition[]> {
  return prisma.slotDefinition.findMany({ orderBy: { slug: 'asc' } });
}

/**
 * One slot definition by its (unique) slug, or `null` if none is declared — the
 * targeted-vs-open decision `fill_slot` keys on (a defined slug is targeted; an
 * undefined slug is an open-mode mint). Returns inactive rows too, so the caller can
 * distinguish "retired" from "never declared".
 */
export async function getSlotDefinition(slug: string): Promise<SlotDefinition | null> {
  return prisma.slotDefinition.findUnique({ where: { slug } });
}

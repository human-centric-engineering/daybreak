/**
 * Module read queries — the read side of the `framework_module` table.
 *
 * Separated from `sync.ts` (the boot-time write side) so admin/ops read surfaces
 * have a single, testable data function to call, mirroring how Sunrise's admin
 * routes delegate reads to a lib function (e.g. `getAllFlags`). The `Module` type
 * comes straight from the generated Prisma client — a framework model, imported
 * here rather than re-exported through core `types/prisma.ts` (which stays free of
 * framework vocabulary per the X6 boundary).
 */

import type { Module } from '@prisma/client';
import { prisma } from '@/lib/db/client';

/**
 * List every framework module row, ordered by slug. Includes rows flagged
 * `isRegistered = false` (code removed but retained for audit) — the read surface
 * shows the full picture and lets the caller filter. Errors propagate to the
 * caller's standard error handling (the admin guard formats them); this does not
 * swallow failures into an empty list.
 */
export async function listModules(): Promise<Module[]> {
  return prisma.module.findMany({ orderBy: { slug: 'asc' } });
}

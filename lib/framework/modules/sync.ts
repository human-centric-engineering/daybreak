/**
 * Boot-time module sync — reconciles the in-code registry into `framework_module`
 * rows (spec §4.1: "registration upserts a row keyed by slug").
 *
 * Called once at server startup by `syncFramework()` (from `lib/framework/index.ts`),
 * after both the framework and the leaf app have registered their modules. Newly
 * registered slugs get a row; a slug that reappeared in code is re-flagged
 * `isRegistered = true`; rows whose code was removed are retained (audit) and
 * flagged `isRegistered = false`.
 *
 * **Two invariants shape the writes:**
 *
 * 1. **Operator columns are never clobbered, and steady-state boots write nothing.**
 *    Code-owned `name` is set only on *create* (`createMany … skipDuplicates`), so
 *    `status`, `config`, the availability window, `audience`, and any operator-edited
 *    `name` survive every boot. The two `updateMany`s are guarded by an `isRegistered`
 *    mismatch, so a boot where nothing changed issues zero row writes and never bumps
 *    `updatedAt` — keeping `updatedAt` meaningful as "last operator edit".
 *
 * 2. **An empty registry is a no-op, never a mass-unregister.** If nothing is
 *    registered we return early *without* touching the table. An empty registry is
 *    indistinguishable from "registration did not run this boot" (a caught leaf/init
 *    error, a dev HMR reset), so mass-flipping every row to `isRegistered = false`
 *    would turn a transient hiccup into silent state corruption. The accepted cost:
 *    a fork that removes its *last* module leaves one stale `isRegistered = true` row
 *    until another module is registered — far safer than unregistering everything on
 *    a fluke empty registry. (It also means `notIn` is only ever evaluated with a
 *    non-empty list, sidestepping any ORM-dependent `notIn: []` semantics.)
 *
 * Wrapped in one interactive transaction via `executeTransaction`. The `{ timeout }`
 * option (Sunrise #368) gives headroom for the write set; for the handful of modules
 * a deployment registers it is negligible.
 */

import { executeTransaction } from '@/lib/db/utils';
import { logger } from '@/lib/logging';
import { getRegisteredModules } from '@/lib/framework/modules/registry';

/**
 * Timeout (ms) for the sync transaction. Above Prisma's 5s default to absorb a
 * cold pooled connection on a larger module set; a ceiling, not a target.
 */
const SYNC_TX_TIMEOUT_MS = 20_000;

export async function syncRegisteredModules(): Promise<void> {
  const definitions = getRegisteredModules();

  // Empty registry ⇒ deliberate no-op (invariant 2). Do NOT run the retire pass:
  // "nothing registered" cannot be told apart from "registration didn't run", and
  // the destructive branch on a fluke-empty registry is the worse failure.
  if (definitions.length === 0) {
    logger.info('syncRegisteredModules: no registered modules — nothing to sync');
    return;
  }

  const slugs = definitions.map((d) => d.slug);

  const retired = await executeTransaction(
    async (tx) => {
      // New rows only; code-owned `name` written once. `skipDuplicates` leaves every
      // existing row (and its operator columns) untouched.
      await tx.module.createMany({
        data: definitions.map((d) => ({ slug: d.slug, name: d.name })),
        skipDuplicates: true,
      });

      // Re-register a slug that was previously removed and has reappeared in code.
      // Guarded by `isRegistered: false` so only rows that actually change are written.
      await tx.module.updateMany({
        where: { slug: { in: slugs }, isRegistered: false },
        data: { isRegistered: true },
      });

      // Retire rows whose code was removed: keep the row (audit), flag unregistered.
      // Guarded by `isRegistered: true`, so already-retired rows aren't rewritten.
      const { count } = await tx.module.updateMany({
        where: { slug: { notIn: slugs }, isRegistered: true },
        data: { isRegistered: false },
      });
      return count;
    },
    { timeout: SYNC_TX_TIMEOUT_MS }
  );

  logger.info('syncRegisteredModules: framework modules synced', {
    registered: slugs.length,
    retired,
  });
}

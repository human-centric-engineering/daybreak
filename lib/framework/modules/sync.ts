/**
 * Boot-time module sync — reconciles the in-code registry into `framework_module`
 * rows (spec §4.1: "registration upserts a row keyed by slug").
 *
 * Called once at server startup by `syncFramework()` (from `lib/framework/index.ts`),
 * after both the framework and the leaf app have registered their modules. For
 * each registered definition it upserts a row by slug; rows whose code was removed
 * are retained (audit) and flagged `isRegistered = false`.
 *
 * **Operator columns are never clobbered.** The upsert writes code-owned data only
 * on *create* (`name` as the initial display default) and, on *update*, touches
 * only `isRegistered` — so `status`, `config`, the availability window, `audience`,
 * and any operator-edited `name` survive every boot. Code describes structure once;
 * the operator owns the row thereafter.
 *
 * Wrapped in a single interactive transaction via `executeTransaction`. The
 * `{ timeout }` option (Sunrise #368) gives headroom for the many-row upsert shape;
 * for the handful of modules a deployment registers it is negligible.
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
  const slugs = definitions.map((d) => d.slug);

  await executeTransaction(
    async (tx) => {
      for (const def of definitions) {
        await tx.module.upsert({
          where: { slug: def.slug },
          // Code-owned defaults, written once at creation.
          create: { slug: def.slug, name: def.name, isRegistered: true },
          // Re-mark present (handles a removed→re-added slug); operator columns untouched.
          update: { isRegistered: true },
        });
      }

      // Rows whose code was removed: keep the row (audit), flag unregistered.
      // `notIn: []` (empty registry) matches all rows — correct: no code ⇒ nothing
      // registered. The `isRegistered: true` filter avoids rewriting already-false rows.
      await tx.module.updateMany({
        where: { slug: { notIn: slugs }, isRegistered: true },
        data: { isRegistered: false },
      });
    },
    { timeout: SYNC_TX_TIMEOUT_MS }
  );

  logger.info('syncRegisteredModules: framework modules synced', {
    registered: slugs.length,
  });
}

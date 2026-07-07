/**
 * Framework database drift-probe registration (f-overlays t-1).
 *
 * Registers the Prisma-*unmodelled* Postgres objects the framework tier adds, so
 * `scripts/db/check-drift.ts` (via `npm run db:drift-check`, CI, and `/pre-pr`) probes them alongside
 * Sunrise's own A-series — catching a future `migrate dev` that silently drops one.
 *
 * This is the drift analogue of the boot seam (`lib/app/bootstrap.ts` → `initFramework()`) and the
 * client-nav seam (`lib/app/admin-nav.ts` → `initFrameworkNav()`): the fork-owned bridge
 * `lib/app/db-drift.ts` calls `registerFrameworkDriftProbes()` here, then delegates to the reserved
 * leaf hook (`lib/app/leaf-db-drift.ts`). It's the reusable seam for any future framework unmodelled
 * object — add a `registerAppDriftProbe(...)` call here.
 *
 * First entry: the HNSW index behind `framework_node_embedding` (f-overlays t-1). Prisma can't model a
 * `USING hnsw` index, so it's created by hand in the migration and must be probed here.
 */

import { registerAppDriftProbe, indexExists } from '@/lib/db/drift-probes';

export function registerFrameworkDriftProbes(): void {
  registerAppDriftProbe({
    name: 'framework: idx_framework_node_embedding (HNSW node-embedding)',
    kind: 'HNSW index',
    table: 'framework_node_embedding',
    probe: indexExists('idx_framework_node_embedding'),
  });
}

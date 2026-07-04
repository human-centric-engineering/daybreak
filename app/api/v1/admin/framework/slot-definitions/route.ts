/**
 * Framework Slot Definitions — admin read endpoint (f-slots t-3).
 *
 * GET /api/v1/admin/framework/slot-definitions — list the registered slot-definition rows.
 *
 * The SECOND route under `app/api/v1/admin/framework/` (the modules read endpoint
 * opened the namespace in f-module-core t-3). Per the X6 boundary it is a
 * *framework-tier* path (the ESLint config lists `app/api/v1/admin/framework/**` in
 * the framework block): it may import `@/lib/framework/*`, and core/app-shell code
 * must not import it.
 *
 * This is the "see it" half of `f-slots`: it proves the registration → row → admin
 * visibility chain for slot definitions without shipping a page a fork would strip
 * (the slot list *page* is deferred to `f-ops-views`).
 *
 * Authentication: admin only (`withAdminAuth`). Rate limiting is NOT applied by the
 * guard — the automatic `/api/v1/**` section cap is enforced by `proxy.ts` via the
 * central policy table (CLAUDE.md "Rate limiting is automatic"), so a read handler
 * needs no per-handler limiter.
 *
 * Returns the raw `SlotDefinition` rows (including `isActive = false` rows retained
 * for audit) — intentional for this admin-only read; DTO shaping is deferred to
 * `f-ops-views`, which owns the list *page*. This endpoint is the API-first surface.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listSlotDefinitions } from '@/lib/framework/data-slots/queries';

export const GET = withAdminAuth(async (request, _session) => {
  const log = await getRouteLogger(request);

  const slotDefinitions = await listSlotDefinitions();

  log.info('Framework slot definitions retrieved', { count: slotDefinitions.length });

  return successResponse(slotDefinitions);
});

/**
 * Framework Modules — admin read endpoint (f-module-core t-3).
 *
 * GET /api/v1/admin/framework/modules — list the registered framework module rows.
 *
 * This is the FIRST route under `app/api/v1/admin/framework/`, establishing the
 * framework admin-API namespace. Per the X6 boundary it is a *framework-tier* path
 * (the ESLint config lists `app/api/v1/admin/framework/**` in the framework block):
 * it may import `@/lib/framework/*`, and core/app-shell code must not import it.
 *
 * Authentication: admin only (`withAdminAuth`). Rate limiting is NOT applied by the
 * guard — the automatic `/api/v1/**` section cap is enforced by `proxy.ts` via the
 * central policy table (CLAUDE.md "Rate limiting is automatic"), so a read handler
 * needs no per-handler limiter.
 *
 * Returns the raw `Module` rows (including operator `config`) — intentional for this
 * admin-only read; DTO shaping is deferred to `f-ops-views`, which owns the list
 * *page*. This endpoint is the API-first surface.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listModules } from '@/lib/framework/modules/queries';

export const GET = withAdminAuth(async (request, _session) => {
  const log = await getRouteLogger(request);

  const modules = await listModules();

  log.info('Framework modules retrieved', { count: modules.length });

  return successResponse(modules);
});

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
 * Authentication: admin only (`withAdminAuth`, which also applies the automatic
 * section rate-limit — no per-handler limiter is needed for a read). The module
 * list *page* is deferred to `f-ops-views`; this endpoint is the API-first surface.
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

/**
 * Framework module engagement stats (f-engagement t-3, spec §4.3).
 *
 * GET /api/v1/admin/framework/modules/:slug/stats — unique users, entries, completions,
 * returning users, and a ratings summary, all DERIVED from the insert-only `JourneyEvent`
 * stream (A9 — never counters). Backs the module detail page's Stats tab (t-3b).
 *
 * Admin-only; framework-tier path. A cross-user aggregate (no per-subject filter today —
 * the subject-scope seam lives in `getModuleStats`). Rate limiting is automatic via
 * `proxy.ts` (the section cap), so this read adds no per-handler limiter.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { NotFoundError } from '@/lib/api/errors';
import { parseModuleSlug } from '@/lib/framework/modules/api-schemas';
import { moduleExists } from '@/lib/framework/modules/queries';
import { getModuleStats } from '@/lib/framework/engagement/stats';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  // 404 an unknown module rather than returning empty stats for a slug that never existed.
  if (!(await moduleExists(slug))) {
    throw new NotFoundError(`Module "${slug}" not found`);
  }

  const stats = await getModuleStats(slug);

  log.info('Framework module stats read', { slug });
  return successResponse(stats);
});

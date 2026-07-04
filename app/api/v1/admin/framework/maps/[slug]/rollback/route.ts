/**
 * Framework Maps — roll back to a prior version (f-map t-3).
 *
 * POST /api/v1/admin/framework/maps/:slug/rollback — create a NEW version copying
 * the target (`{ targetVersion }`, a version NUMBER) and pin it; history is never
 * rewritten. The target is re-validated before writing.
 *
 * Admin-only; framework-tier path.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { rollback } from '@/lib/framework/facilitation/map/version-service';
import { parseMapSlug, rollbackMapBodySchema } from '@/lib/framework/facilitation/map/api-schemas';

export const POST = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const body = await validateRequestBody(request, rollbackMapBodySchema);

  const result = await rollback({
    slug,
    targetVersion: body.targetVersion,
    userId: session.user.id,
    changeSummary: body.changeSummary,
    clientIp,
  });

  log.info('Framework map rolled back', {
    slug,
    targetVersion: body.targetVersion,
    newVersion: result.version.version,
    adminId: session.user.id,
  });
  return successResponse(result);
});

/**
 * Framework Maps — publish draft (f-map t-3).
 *
 * POST /api/v1/admin/framework/maps/:slug/publish — promote the draft to a new
 * immutable version and pin it. The service gates on `validatePublishableMap`
 * (Zod → referential), so an invalid draft (or none) is a ValidationError → 400.
 *
 * Admin-only; framework-tier path.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { publishDraft } from '@/lib/framework/facilitation/map/version-service';
import { parseMapSlug, publishMapBodySchema } from '@/lib/framework/facilitation/map/api-schemas';

export const POST = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const body = await validateRequestBody(request, publishMapBodySchema);

  const result = await publishDraft({
    slug,
    userId: session.user.id,
    changeSummary: body.changeSummary,
    clientIp,
  });

  log.info('Framework map published', {
    slug,
    version: result.version.version,
    adminId: session.user.id,
  });
  return successResponse(result);
});

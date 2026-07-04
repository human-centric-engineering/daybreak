/**
 * Framework Maps — list versions (f-map t-3).
 *
 * GET /api/v1/admin/framework/maps/:slug/versions — immutable versions, newest
 * first, cursor-paginated (`cursor` = the id of the last version on the previous
 * page). 404s for an unknown map (the service's `listVersions` resolves the slug
 * first), so an empty list is never confused with a missing map.
 *
 * Admin-only; framework-tier path.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { listVersions } from '@/lib/framework/facilitation/map/version-service';
import {
  parseMapSlug,
  listMapVersionsQuerySchema,
} from '@/lib/framework/facilitation/map/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const { searchParams } = new URL(request.url);
  const opts = validateQueryParams(searchParams, listMapVersionsQuerySchema);

  const result = await listVersions(slug, opts);

  log.info('Framework map versions listed', { slug, count: result.versions.length });
  return successResponse(result);
});

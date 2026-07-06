/**
 * Framework module config — list config versions (f-module-config t-2).
 *
 * GET /api/v1/admin/framework/modules/:slug/versions — immutable config versions,
 *     newest first, cursor-paginated (`cursor` = the id of the last version on the
 *     previous page). 404s for an unknown module (the service resolves the slug first),
 *     so an empty list is never confused with a missing module. The newest version is
 *     always the live config (no draft/published split).
 *
 * Admin-only; framework-tier path.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { listModuleVersions } from '@/lib/framework/modules/config/version-service';
import {
  parseModuleSlug,
  listModuleVersionsQuerySchema,
} from '@/lib/framework/modules/config/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const { searchParams } = new URL(request.url);
  const opts = validateQueryParams(searchParams, listModuleVersionsQuerySchema);

  const result = await listModuleVersions(slug, opts);

  log.info('Framework module config versions listed', { slug, count: result.versions.length });
  return successResponse(result);
});

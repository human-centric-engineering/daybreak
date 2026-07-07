/**
 * Framework journeys — admin explorer list endpoint (f-ops-views t-5a).
 *
 * GET /api/v1/admin/framework/journeys — a paginated list of user journeys for the
 * explorer picker (newest first), each stitched with its map name + a completed/total
 * node count. Optional `?graphSlug=` scopes to one map; `?page`/`?limit` paginate.
 *
 * Admin-only; framework-tier path (rate limiting automatic via `proxy.ts`). The
 * viewer is constructed with `isAdminSupport: true` **explicitly** — an operator on
 * this support surface may read other users' journeys — rather than derived from
 * `role === 'ADMIN'` inside the access seam; `subjectScope` honours the flag, so a
 * non-support caller would only ever see their own rows. Cross-user visibility stays
 * admin-support-only until Sunrise #366/#367 land the ownership resolver.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { paginatedResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { adminSupportViewer } from '@/lib/framework/shared/access';
import { listJourneysForAdmin } from '@/lib/framework/facilitation/journey/admin-queries';
import { listJourneysQuerySchema } from '@/lib/framework/facilitation/journey/api-schemas';

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const { searchParams } = new URL(request.url);
  const { page, limit, graphSlug } = validateQueryParams(searchParams, listJourneysQuerySchema);

  // Explicit support-tooling viewer (not a role check inside the seam) — see header.
  const viewer = adminSupportViewer(session.user.id);

  const { items, total } = await listJourneysForAdmin(viewer, { page, limit, graphSlug });

  log.info('Framework journeys listed', { count: items.length, total, page, limit, graphSlug });
  return paginatedResponse(items, { page, limit, total });
});

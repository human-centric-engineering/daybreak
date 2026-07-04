/**
 * Framework Maps — single map: detail + draft (f-map t-3).
 *
 * GET   /api/v1/admin/framework/maps/:slug — the map with its published version.
 * PATCH /api/v1/admin/framework/maps/:slug — save the draft (`{ definition }`), or
 *       discard it (`{ definition: null }`). Publishing is a separate POST /publish.
 *
 * Admin-only; framework-tier path. Draft edits never touch the published version —
 * `publishDraft` promotes them.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import { saveDraft, discardDraft } from '@/lib/framework/facilitation/map/version-service';
import { parseMapSlug, saveDraftBodySchema } from '@/lib/framework/facilitation/map/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const graph = await getGraphDetail(slug);

  log.info('Framework map fetched', { slug });
  return successResponse(graph);
});

export const PATCH = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const body = await validateRequestBody(request, saveDraftBodySchema);

  const graph =
    body.definition === null
      ? await discardDraft({ slug, userId: session.user.id, clientIp })
      : await saveDraft({ slug, definition: body.definition, userId: session.user.id, clientIp });

  log.info('Framework map draft updated', {
    slug,
    discarded: body.definition === null,
    adminId: session.user.id,
  });
  return successResponse(graph);
});

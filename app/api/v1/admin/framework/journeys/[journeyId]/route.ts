/**
 * Framework journeys — single-journey detail endpoint (f-ops-views t-5a).
 *
 * GET /api/v1/admin/framework/journeys/:journeyId — the enriched detail bundle the
 * explorer renders: the journey identity, the published map structure it is walked
 * against (or `null`), the current node-state overlay, and the full chronological
 * event timeline for replay. One enriched read (no N+1) fed by `admin-queries`.
 *
 * Admin-only; framework-tier. The viewer is built with `isAdminSupport: true`
 * **explicitly** (see the list route header). A missing journey ⇒ 404; a viewer the
 * access seam denies ⇒ 403 (`getJourneyById` throws `ForbiddenError`, mapped by the
 * guard). A malformed `[journeyId]` ⇒ 400 via `parseJourneyId`.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { NotFoundError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { getJourneyDetailForAdmin } from '@/lib/framework/facilitation/journey/admin-queries';
import { parseJourneyId } from '@/lib/framework/facilitation/journey/api-schemas';

export const GET = withAdminAuth<{ journeyId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const journeyId = parseJourneyId((await params).journeyId);

  // Explicit support-tooling viewer (not a role check inside the seam) — see the list route.
  const viewer = { userId: session.user.id, isAdminSupport: true };

  const detail = await getJourneyDetailForAdmin(viewer, journeyId);
  if (!detail) throw new NotFoundError('Journey not found');

  log.info('Framework journey detail read', {
    journeyId,
    events: detail.timeline.length,
    nodes: detail.nodeStates.length,
  });
  return successResponse(detail);
});

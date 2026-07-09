/**
 * Framework map collective heat (f-engagement-analytics t-1, spec §4.3).
 *
 * GET /api/v1/admin/framework/maps/:slug/heat — per-node collective traffic + drop-off,
 * DERIVED from the insert-only `JourneyEvent` stream (A9 — never counters). Backs the
 * map heat overlay (t-1b): the client joins these per-node figures onto the published
 * map structure it lays out, so nodes with no activity render as zero-heat.
 *
 * Admin-only; framework-tier path. A cross-user aggregate (no per-subject filter today —
 * the subject-scope seam lives in `getMapHeat`). Rate limiting is automatic via
 * `proxy.ts` (the section cap), so this read adds no per-handler limiter.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { NotFoundError } from '@/lib/api/errors';
import { parseMapSlug } from '@/lib/framework/facilitation/map/api-schemas';
import { graphExists } from '@/lib/framework/facilitation/map/queries';
import { getMapHeat } from '@/lib/framework/engagement/map-heat';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  // 404 an unknown map rather than returning empty heat for a slug that never existed.
  if (!(await graphExists(slug))) {
    throw new NotFoundError(`Facilitation map "${slug}" not found`);
  }

  const heat = await getMapHeat(slug);

  log.info('Framework map heat read', { slug, nodes: heat.nodes.length });
  return successResponse(heat);
});

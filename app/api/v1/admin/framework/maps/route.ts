/**
 * Framework Maps — admin list + create (f-map t-3).
 *
 * GET  /api/v1/admin/framework/maps — list every facilitation map (by slug).
 * POST /api/v1/admin/framework/maps — create a map, optionally with an initial
 *      definition that is validated and published as v1.
 *
 * Framework-tier path (`app/api/v1/admin/framework/**` is in the X6 ESLint block),
 * so it may import `@/lib/framework/*`. Admin-only (`withAdminAuth`); the automatic
 * `/api/v1/**` section rate-limit is applied by `proxy.ts`, so no per-handler
 * limiter. The map editor UI (the canvas) is `f-map-editor` (feature 14); this is
 * the API-first surface it drives.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { listGraphs } from '@/lib/framework/facilitation/map/queries';
import { createGraph } from '@/lib/framework/facilitation/map/version-service';
import { createMapBodySchema } from '@/lib/framework/facilitation/map/api-schemas';

export const GET = withAdminAuth(async (request, _session) => {
  const log = await getRouteLogger(request);

  const maps = await listGraphs();

  log.info('Framework maps listed', { count: maps.length });
  return successResponse(maps);
});

export const POST = withAdminAuth(async (request, session) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);

  const body = await validateRequestBody(request, createMapBodySchema);

  // A duplicate slug surfaces as a ValidationError from the service (not a raw
  // P2002); withAdminAuth routes it through handleAPIError → 400.
  const graph = await createGraph({
    slug: body.slug,
    name: body.name,
    description: body.description ?? null,
    definition: body.definition,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework map created', {
    slug: graph.slug,
    published: graph.publishedVersionId !== null,
    adminId: session.user.id,
  });
  return successResponse(graph, undefined, { status: 201 });
});

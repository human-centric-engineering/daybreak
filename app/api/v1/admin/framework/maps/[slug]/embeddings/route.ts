/**
 * Framework map node-embeddings — sync + status (f-overlays t-1, spec §5.4, F9).
 *
 * POST /api/v1/admin/framework/maps/:slug/embeddings — embed every node of the map's published
 *      version on-demand and upsert the vectors (advisory "related places" source, t-2); returns the
 *      summary (201). A map with no published version → 404.
 * GET  /api/v1/admin/framework/maps/:slug/embeddings — how many node embeddings are stored for the
 *      current published version (0 when unembedded; `version: null` when nothing is published).
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`; the sync is audited in
 * the service. The embedding vectors are advisory only — they never feed eligibility (F9).
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { parseMapSlug } from '@/lib/framework/facilitation/map/api-schemas';
import { getPublishedMap } from '@/lib/framework/facilitation/map/version-service';
import { syncMapNodeEmbeddings } from '@/lib/framework/facilitation/overlays/embed-sync';
import { countNodeEmbeddings } from '@/lib/framework/facilitation/overlays/queries';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const map = await getPublishedMap(slug);
  const embeddedNodeCount = map ? await countNodeEmbeddings(slug, map.version) : 0;

  log.info('Framework map embeddings status read', {
    slug,
    version: map?.version ?? null,
    embeddedNodeCount,
  });
  return successResponse({ slug, version: map?.version ?? null, embeddedNodeCount });
});

export const POST = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const result = await syncMapNodeEmbeddings({
    slug,
    actorUserId: session.user.id,
    clientIp,
  });

  log.info('Framework map node embeddings synced', {
    slug,
    version: result.version,
    embeddedCount: result.embeddedCount,
    adminId: session.user.id,
  });
  return successResponse(result, undefined, { status: 201 });
});

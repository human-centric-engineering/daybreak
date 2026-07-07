/**
 * Framework atlas — the composition-graph read endpoint (f-atlas t-1).
 *
 * GET /api/v1/admin/framework/atlas — the whole framework configuration assembled into ONE
 * normalized read-only projection (modules + their bound agents/workflows/slots/capabilities/
 * knowledge, the facilitation layer, and the published maps): a pure projection with zero new
 * schema (X8), so it cannot drift from reality. The client mapper (t-2) lays it out on the canvas.
 *
 * Admin-only; framework-tier path (rate limiting automatic via `proxy.ts`). Read-only — there is no
 * write counterpart; the atlas navigates to the real editors, it never edits (X8).
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { assembleComposition } from '@/lib/framework/atlas/assemble';

export const GET = withAdminAuth(async (request) => {
  const log = await getRouteLogger(request);

  const projection = await assembleComposition();

  log.info('Framework atlas assembled', {
    modules: projection.modules.length,
    agents: projection.agents.length,
    workflows: projection.workflows.length,
    slots: projection.slots.length,
    capabilities: projection.capabilities.length,
    knowledge: projection.knowledge.length,
    maps: projection.maps.length,
    edges: projection.edges.length,
  });
  return successResponse(projection);
});

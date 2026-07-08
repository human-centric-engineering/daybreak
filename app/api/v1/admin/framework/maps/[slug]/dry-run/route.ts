/**
 * Framework Maps — journey dry-run simulator (f-map-editor t-5, spec Appendix A — F18).
 *
 * POST /api/v1/admin/framework/maps/:slug/dry-run — simulate a synthetic user against
 * the **in-editor `definition`** carried in the body (so unsaved edits are testable),
 * with synthetic `{ completions, slots, now }`. Runs the PURE `computeAvailability` +
 * `rankMoves` over an in-memory graph and returns per-node availability + every
 * `lockReason` + the ranked moves. **Zero DB, zero writes** — never touches journey
 * state, the published graph, or guidance (see `lib/framework/facilitation/dry-run.ts`).
 *
 * The engine internals stay server-side (no framework-engine client bundle): the editor's
 * simulator panel calls this endpoint and renders the JSON. A malformed definition fails
 * `mapDefinitionSchema` in the body validator → 400 with field errors, never a crash.
 *
 * Admin-only (`withAdminAuth`); framework-tier path. Rate limiting is automatic via
 * `proxy.ts` (the `/api/v1/**` section cap), so no per-handler limiter.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { runDryRun } from '@/lib/framework/facilitation/dry-run';
import { parseMapSlug, dryRunMapBodySchema } from '@/lib/framework/facilitation/map/api-schemas';

export const POST = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseMapSlug((await params).slug);

  const body = await validateRequestBody(request, dryRunMapBodySchema);

  const result = runDryRun(body.definition, {
    completions: body.completions,
    slots: body.slots.map((s) => ({
      slug: s.slug,
      value: s.value,
      ...(s.confidence !== undefined ? { confidence: s.confidence } : {}),
      ...(s.capturedAt ? { capturedAt: new Date(s.capturedAt) } : {}),
    })),
    now: body.now ? new Date(body.now) : new Date(),
  });

  log.info('Framework map dry-run', {
    slug,
    nodes: result.nodes.length,
    available: result.validMoves.length,
  });
  return successResponse(result);
});

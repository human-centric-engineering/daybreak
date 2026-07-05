/**
 * Framework module agent bindings — list + bind (f-module-bindings t-1).
 *
 * GET  /api/v1/admin/framework/modules/:slug/agents — the module's agent bindings,
 *      each stitched with the bound agent's display fields.
 * POST /api/v1/admin/framework/modules/:slug/agents — bind an agent into a seat
 *      (`{ agentId, role, isPrimary?, config? }`); 201 with the new binding.
 *
 * Admin-only; framework-tier path (the ESLint config lists
 * `app/api/v1/admin/framework/**` in the framework block). Rate limiting is
 * automatic via `proxy.ts` (CLAUDE.md), so no per-handler limiter. Mutations are
 * audited in the service. Binding management *pages* are `f-ops-views` (15) — this
 * is the API-first surface those pages drive.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { listModuleBindings } from '@/lib/framework/modules/bindings/queries';
import { bindAgent } from '@/lib/framework/modules/bindings/service';
import { parseModuleSlug, bindAgentBodySchema } from '@/lib/framework/modules/bindings/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const bindings = await listModuleBindings(slug);

  log.info('Framework module agent bindings listed', { slug, count: bindings.length });
  return successResponse(bindings);
});

export const POST = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const body = await validateRequestBody(request, bindAgentBodySchema);

  const binding = await bindAgent({
    moduleSlug: slug,
    agentId: body.agentId,
    role: body.role,
    isPrimary: body.isPrimary,
    config: body.config,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework module agent bound', {
    slug,
    bindingId: binding.id,
    agentId: binding.agentId,
    role: binding.role,
    adminId: session.user.id,
  });
  return successResponse(binding, undefined, { status: 201 });
});

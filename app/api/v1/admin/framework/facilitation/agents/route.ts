/**
 * Framework facilitation agent bindings — list + bind (f-facilitation-agents t-1).
 *
 * GET  /api/v1/admin/framework/facilitation/agents — the facilitation seats + bound agents,
 *      each stitched with the bound agent's display fields.
 * POST /api/v1/admin/framework/facilitation/agents — bind an agent into a seat
 *      (`{ agentId, role, config? }`); 201 with the new binding.
 *
 * Admin-only; framework-tier path (the ESLint config lists `app/api/v1/admin/framework/**` in
 * the framework block). Rate limiting is automatic via `proxy.ts` (CLAUDE.md), so no
 * per-handler limiter. Mutations are audited in the service. Binding management *pages* are
 * `f-ops-views` (15) — this is the API-first surface those pages drive.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { listFacilitationBindings } from '@/lib/framework/facilitation/agents/binding-queries';
import { bindFacilitationAgent } from '@/lib/framework/facilitation/agents/binding-service';
import { bindFacilitationAgentBodySchema } from '@/lib/framework/facilitation/agents/api-schemas';

export const GET = withAdminAuth(async (request) => {
  const log = await getRouteLogger(request);

  const bindings = await listFacilitationBindings();

  log.info('Framework facilitation agent bindings listed', { count: bindings.length });
  return successResponse(bindings);
});

export const POST = withAdminAuth(async (request, session) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);

  const body = await validateRequestBody(request, bindFacilitationAgentBodySchema);

  const binding = await bindFacilitationAgent({
    agentId: body.agentId,
    role: body.role,
    config: body.config,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework facilitation agent bound', {
    bindingId: binding.id,
    agentId: binding.agentId,
    role: binding.role,
    adminId: session.user.id,
  });
  return successResponse(binding, undefined, { status: 201 });
});

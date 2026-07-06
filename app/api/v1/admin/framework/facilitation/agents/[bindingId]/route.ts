/**
 * Framework facilitation agent bindings — update + unbind a single binding
 * (f-facilitation-agents t-1).
 *
 * PATCH  /api/v1/admin/framework/facilitation/agents/:bindingId — update the config override
 *        (`{ config }`; `config: null` clears). Reassigning the seat is unbind + rebind.
 * DELETE /api/v1/admin/framework/facilitation/agents/:bindingId — unbind (frees the seat).
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`; mutations are
 * audited in the service.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import {
  updateFacilitationBinding,
  unbindFacilitationAgent,
} from '@/lib/framework/facilitation/agents/binding-service';
import {
  parseFacilitationBindingId,
  updateFacilitationBindingBodySchema,
} from '@/lib/framework/facilitation/agents/api-schemas';

export const PATCH = withAdminAuth<{ bindingId: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const bindingId = parseFacilitationBindingId((await params).bindingId);

  const body = await validateRequestBody(request, updateFacilitationBindingBodySchema);

  const binding = await updateFacilitationBinding({
    bindingId,
    config: body.config,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework facilitation agent binding updated', {
    bindingId,
    adminId: session.user.id,
  });
  return successResponse(binding);
});

export const DELETE = withAdminAuth<{ bindingId: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const bindingId = parseFacilitationBindingId((await params).bindingId);

  await unbindFacilitationAgent({ bindingId, userId: session.user.id, clientIp });

  log.info('Framework facilitation agent unbound', { bindingId, adminId: session.user.id });
  return successResponse({ id: bindingId, unbound: true });
});

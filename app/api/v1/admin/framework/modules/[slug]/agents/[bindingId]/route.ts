/**
 * Framework module agent bindings — update + unbind a single binding
 * (f-module-bindings t-1).
 *
 * PATCH  /api/v1/admin/framework/modules/:slug/agents/:bindingId — update the lead-
 *        seat flag and/or config (`{ isPrimary?, config? }`; `config: null` clears).
 * DELETE /api/v1/admin/framework/modules/:slug/agents/:bindingId — unbind.
 *
 * Admin-only; framework-tier path. The binding must belong to the named module
 * (else 404). Rate limiting is automatic via `proxy.ts`; mutations are audited in
 * the service. Changing the *seat* (`role`) is an unbind + rebind, not a PATCH.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { updateBinding, unbindAgent } from '@/lib/framework/modules/bindings/service';
import {
  parseModuleSlug,
  parseBindingId,
  updateBindingBodySchema,
} from '@/lib/framework/modules/bindings/api-schemas';

export const PATCH = withAdminAuth<{ slug: string; bindingId: string }>(
  async (request, session, { params }) => {
    const clientIp = getClientIP(request);
    const log = await getRouteLogger(request);
    const { slug: rawSlug, bindingId: rawBindingId } = await params;
    const slug = parseModuleSlug(rawSlug);
    const bindingId = parseBindingId(rawBindingId);

    const body = await validateRequestBody(request, updateBindingBodySchema);

    const binding = await updateBinding({
      moduleSlug: slug,
      bindingId,
      isPrimary: body.isPrimary,
      config: body.config,
      userId: session.user.id,
      clientIp,
    });

    log.info('Framework module agent binding updated', {
      slug,
      bindingId,
      adminId: session.user.id,
    });
    return successResponse(binding);
  }
);

export const DELETE = withAdminAuth<{ slug: string; bindingId: string }>(
  async (request, session, { params }) => {
    const clientIp = getClientIP(request);
    const log = await getRouteLogger(request);
    const { slug: rawSlug, bindingId: rawBindingId } = await params;
    const slug = parseModuleSlug(rawSlug);
    const bindingId = parseBindingId(rawBindingId);

    await unbindAgent({ moduleSlug: slug, bindingId, userId: session.user.id, clientIp });

    log.info('Framework module agent unbound', { slug, bindingId, adminId: session.user.id });
    return successResponse({ id: bindingId, unbound: true });
  }
);

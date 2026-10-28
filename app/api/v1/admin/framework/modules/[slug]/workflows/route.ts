/**
 * Framework module workflow bindings — list + bind (f-module-bindings t-3).
 *
 * GET  /api/v1/admin/framework/modules/:slug/workflows — the module's workflow
 *      bindings, each stitched with the bound workflow's display fields.
 * POST /api/v1/admin/framework/modules/:slug/workflows — bind an event to a workflow
 *      (`{ workflowId, eventType, inputTemplate?, enabled? }`); 201 with the binding.
 *
 * Admin-only; framework-tier path (the ESLint config lists
 * `app/api/v1/admin/framework/**` in the framework block). Rate limiting is automatic
 * via `proxy.ts` (CLAUDE.md). Mutations are audited in the service. Binding management
 * *pages* are `f-ops-views` (15) — this is the API-first surface those pages drive.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { listModuleWorkflowBindings } from '@/lib/framework/modules/workflow-bindings/queries';
import { bindWorkflow } from '@/lib/framework/modules/workflow-bindings/service';
import {
  parseModuleSlug,
  bindWorkflowBodySchema,
} from '@/lib/framework/modules/workflow-bindings/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const bindings = await listModuleWorkflowBindings(slug);

  log.info('Framework module workflow bindings listed', { slug, count: bindings.length });
  return successResponse(bindings);
});

export const POST = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const body = await validateRequestBody(request, bindWorkflowBodySchema);

  const binding = await bindWorkflow({
    moduleSlug: slug,
    workflowId: body.workflowId,
    eventType: body.eventType,
    inputTemplate: body.inputTemplate,
    enabled: body.enabled,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework module workflow bound', {
    slug,
    bindingId: binding.id,
    workflowId: binding.workflowId,
    eventType: binding.eventType,
    adminId: session.user.id,
  });
  return successResponse(binding, undefined, { status: 201 });
});

/**
 * Framework module config — read the generic form / save operator config
 * (f-module-config t-2).
 *
 * GET /api/v1/admin/framework/modules/:slug/config — the field descriptors a client
 *     renders a generic form from (derived from the module's registered Zod
 *     `configSchema`, A4) plus the module's current stored values.
 * PUT /api/v1/admin/framework/modules/:slug/config — validate `{ config, changeSummary? }`
 *     against the module's schema, write `Module.config`, and snapshot a `ModuleVersion`.
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`. The save is
 * audited in the service. The client form + version-history tab are `f-ops-views` (15) —
 * this is the API-first surface they drive.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { getModuleConfigForm } from '@/lib/framework/modules/config/queries';
import { saveModuleConfig } from '@/lib/framework/modules/config/version-service';
import {
  parseModuleSlug,
  saveModuleConfigBodySchema,
} from '@/lib/framework/modules/config/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const form = await getModuleConfigForm(slug);

  log.info('Framework module config form read', {
    slug,
    registered: form.registered,
    fields: form.descriptors.length,
  });
  return successResponse(form);
});

export const PUT = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const body = await validateRequestBody(request, saveModuleConfigBodySchema);

  const result = await saveModuleConfig({
    slug,
    config: body.config,
    changeSummary: body.changeSummary,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework module config saved', {
    slug,
    version: result.version.version,
    adminId: session.user.id,
  });
  return successResponse(result);
});

/**
 * Framework module — single-module lifecycle resource (f-ops-views t-3).
 *
 * GET    /api/v1/admin/framework/modules/:slug — the module's operator settings (identity,
 *        lifecycle status, audience, feature-flag binding, availability window). Backs the
 *        detail page's identity read and the Settings form.
 * PATCH  /api/v1/admin/framework/modules/:slug — partial update of those settings
 *        (`{ name?, status?, audience?, featureFlagName?, availableFrom?, availableUntil? }`).
 * DELETE /api/v1/admin/framework/modules/:slug — hard-delete an UNREGISTERED module (409 if
 *        it's still registered — retire it instead). Cascades to its versions / bindings /
 *        knowledge scope and clears the agent knowledge-access cache (in the service).
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts` (the section
 * cap), so the write handlers add no per-handler limiter. `config` versioning is a separate
 * surface (`.../config`); this route never touches `Module.config`.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { getModuleSettings } from '@/lib/framework/modules/queries';
import { updateModuleSettings, deleteModule } from '@/lib/framework/modules/service';
import type { ModuleSettingsPatch } from '@/lib/framework/modules/service';
import { parseModuleSlug, updateModuleBodySchema } from '@/lib/framework/modules/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const settings = await getModuleSettings(slug);

  log.info('Framework module settings read', { slug });
  return successResponse(settings);
});

export const PATCH = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const body = await validateRequestBody(request, updateModuleBodySchema);

  // Build the patch from only the keys the operator sent, coercing the ISO-string window
  // bounds to `Date`. A JSON body can't carry `undefined`, so `!== undefined` means "sent"
  // (and preserves the null-clears-the-field distinction); it also narrows the optional-
  // schema type so `new Date(...)` sees a `string`, which `'key' in body` would not.
  const patch: ModuleSettingsPatch = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.status !== undefined) patch.status = body.status;
  if (body.audience !== undefined) patch.audience = body.audience;
  if (body.featureFlagName !== undefined) patch.featureFlagName = body.featureFlagName;
  if (body.availableFrom !== undefined) {
    patch.availableFrom = body.availableFrom === null ? null : new Date(body.availableFrom);
  }
  if (body.availableUntil !== undefined) {
    patch.availableUntil = body.availableUntil === null ? null : new Date(body.availableUntil);
  }

  const updated = await updateModuleSettings({
    slug,
    patch,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework module settings updated', {
    slug,
    fields: Object.keys(patch),
    adminId: session.user.id,
  });
  return successResponse(updated);
});

export const DELETE = withAdminAuth<{ slug: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  await deleteModule({ slug, userId: session.user.id, clientIp });

  log.info('Framework module deleted', { slug, adminId: session.user.id });
  return successResponse({ deleted: true });
});

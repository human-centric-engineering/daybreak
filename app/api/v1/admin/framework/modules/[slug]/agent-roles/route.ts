/**
 * Framework module agent seats — the roles a module declares (f-ops-views t-4a).
 *
 * GET /api/v1/admin/framework/modules/:slug/agent-roles — the bindable agent seats the
 *     module's registered `ModuleDefinition` declares (`{ registered, roles }`), read from
 *     the code registry. Backs the Agents tab's role picker: an operator can only bind an
 *     agent into a declared seat (the bind service validates the same list), so the UI needs
 *     it to offer a role dropdown instead of a blind free-text guess.
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`. A read, so no
 * per-handler limiter. Unknown module ⇒ 404.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getModuleAgentRoles } from '@/lib/framework/modules/bindings/queries';
import { parseModuleSlug } from '@/lib/framework/modules/bindings/api-schemas';

export const GET = withAdminAuth<{ slug: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const slug = parseModuleSlug((await params).slug);

  const result = await getModuleAgentRoles(slug);

  log.info('Framework module agent roles read', {
    slug,
    registered: result.registered,
    roles: result.roles.length,
  });
  return successResponse(result);
});

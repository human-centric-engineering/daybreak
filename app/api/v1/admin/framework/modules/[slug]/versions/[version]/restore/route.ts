/**
 * Framework module config — restore a prior version (f-module-config t-2).
 *
 * POST /api/v1/admin/framework/modules/:slug/versions/:version/restore — re-validate
 *      the target version's snapshot against the module's current schema, write it back
 *      to `Module.config`, and snapshot it forward as a NEW version; history is never
 *      rewound. `:version` is a version NUMBER. Rejects with a restore-specific 400 when
 *      the snapshot no longer matches the current schema.
 *
 * Admin-only; framework-tier path. The restore is audited in the service.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { restoreModuleVersion } from '@/lib/framework/modules/config/version-service';
import { parseModuleSlug, parseVersionParam } from '@/lib/framework/modules/config/api-schemas';

export const POST = withAdminAuth<{ slug: string; version: string }>(
  async (request, session, { params }) => {
    const clientIp = getClientIP(request);
    const log = await getRouteLogger(request);
    const { slug: rawSlug, version: rawVersion } = await params;
    const slug = parseModuleSlug(rawSlug);
    const version = parseVersionParam(rawVersion);

    const result = await restoreModuleVersion({
      slug,
      version,
      userId: session.user.id,
      clientIp,
    });

    log.info('Framework module config restored', {
      slug,
      restoredFromVersion: version,
      newVersion: result.version.version,
      adminId: session.user.id,
    });
    return successResponse(result);
  }
);

/**
 * Framework proactive guidance — deliver nudges (f-overlays t-3b, spec §5.4, F13).
 *
 * POST /api/v1/admin/framework/facilitation/proactive-guidance/deliver — run the sweep AND email the
 *      throttled nudges now (the manual counterpart to the scheduled `framework_proactive_guidance`
 *      workflow step). Optional body `{ stalledDays?, maxJourneys?, throttleDays? }`; an empty body uses
 *      the documented defaults. Returns the per-outcome summary (scanned / candidates / throttled /
 *      sent / noEmail / failed).
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`; the run is audited. Unlike
 * the sibling preview endpoint, this one SENDS email + writes throttle rows.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { deliverNudgesBodySchema } from '@/lib/framework/facilitation/overlays/api-schemas';
import { deliverProactiveNudges } from '@/lib/framework/facilitation/overlays/nudge';

const ENTITY_TYPE = 'framework_proactive_guidance';

export const POST = withAdminAuth(async (request, session) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);

  // All fields optional → tolerate an empty body ("deliver with the defaults").
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = deliverNudgesBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.issues.map((i: z.ZodIssue) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const result = await deliverProactiveNudges(parsed.data);

  logAdminAction({
    userId: session.user.id,
    action: 'framework_proactive_guidance.deliver',
    entityType: ENTITY_TYPE,
    entityId: 'deliver',
    metadata: { ...parsed.data, ...result },
    clientIp,
  });

  log.info('Framework proactive-guidance nudges delivered', {
    scanned: result.scanned,
    candidates: result.candidates,
    emailsSent: result.emailsSent,
    journeysNudged: result.journeysNudged,
    throttled: result.throttled,
    failed: result.failed,
    adminId: session.user.id,
  });
  return successResponse(result);
});

/**
 * Framework proactive guidance — sweep preview (f-overlays t-3a, spec §5.4, F13).
 *
 * POST /api/v1/admin/framework/facilitation/proactive-guidance — run the proactive-guidance sweep
 *      on-demand and return the journeys that WOULD be nudged (stalled active journeys with a
 *      worthwhile next step) + their suggested step. Preview only — delivery (email), de-duplication,
 *      and scheduling arrive in t-3b. Optional body `{ stalledDays?, maxJourneys? }`; an empty body
 *      uses the documented defaults.
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`; the run is audited. The
 * sweep is read-only (the sole write is the audit row) and LLM-free, but it does per-journey guidance
 * reads (incl. per-move similarity queries when embeddings exist), serial and bounded by `maxJourneys`.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { proactiveSweepBodySchema } from '@/lib/framework/facilitation/overlays/api-schemas';
import {
  runProactiveGuidanceSweep,
  stalledBeforeFromDays,
  DEFAULT_STALLED_DAYS,
  DEFAULT_MAX_JOURNEYS,
} from '@/lib/framework/facilitation/overlays/proactive-sweep';

const ENTITY_TYPE = 'framework_proactive_guidance';

export const POST = withAdminAuth(async (request, session) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);

  // All fields are optional, so tolerate an empty body (an empty POST = "sweep with the defaults").
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = proactiveSweepBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.issues.map((i: z.ZodIssue) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const stalledDays = parsed.data.stalledDays ?? DEFAULT_STALLED_DAYS;
  const maxJourneys = parsed.data.maxJourneys ?? DEFAULT_MAX_JOURNEYS;

  const result = await runProactiveGuidanceSweep({
    stalledBefore: stalledBeforeFromDays(stalledDays, new Date()),
    maxJourneys,
  });

  logAdminAction({
    userId: session.user.id,
    action: 'framework_proactive_guidance.preview',
    entityType: ENTITY_TYPE,
    entityId: 'sweep',
    metadata: {
      stalledDays,
      maxJourneys,
      scanned: result.scanned,
      candidates: result.candidates.length,
    },
    clientIp,
  });

  log.info('Framework proactive-guidance sweep previewed', {
    stalledDays,
    scanned: result.scanned,
    candidates: result.candidates.length,
    adminId: session.user.id,
  });
  return successResponse(result);
});

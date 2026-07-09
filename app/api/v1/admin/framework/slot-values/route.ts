/**
 * Framework slot values — admin read endpoint (f-admin-surfaces t-1).
 *
 * GET /api/v1/admin/framework/slot-values — a paginated page of current slot-value
 * heads (`supersededAt IS NULL`), newest-captured first, optionally narrowed by
 * `?slotSlug=` and/or `?userId=`; `?page`/`?limit` paginate. The **one new endpoint**
 * f-admin-surfaces builds (the rest of the feature is UI over shipped APIs) — and its
 * trust-boundary slice, so it is isolated for focused review.
 *
 * Admin-only; framework-tier path (rate limiting automatic via `proxy.ts`). `SlotValue`
 * is per-user personal data carrying a `sensitivity` grade, so the read masks
 * `sensitive` / `special_category` values by default (see `admin-queries.ts`,
 * decision B). `?reveal=true` returns the stored form instead — an explicit operator
 * action, so it is **audited** (`logAdminAction`) before responding. Cross-user reads
 * are admin-support-only by the `withAdminAuth` guard, mirroring the journey explorer.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { paginatedResponse } from '@/lib/api/responses';
import { validateQueryParams } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { listSlotValueHeadsForAdmin } from '@/lib/framework/data-slots/admin-queries';
import { listSlotValuesQuerySchema } from '@/lib/framework/data-slots/api-schemas';

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const { searchParams } = new URL(request.url);
  const { page, limit, slotSlug, userId, reveal } = validateQueryParams(
    searchParams,
    listSlotValuesQuerySchema
  );

  const { items, total } = await listSlotValueHeadsForAdmin({
    page,
    limit,
    slotSlug,
    userId,
    reveal,
  });

  // Revealing sensitive values is an operator action worth an audit trail — log it
  // (fire-and-forget) before responding. Masked reads are not audited (nothing revealed).
  if (reveal) {
    logAdminAction({
      userId: session.user.id,
      action: 'framework.slot_values.reveal',
      entityType: 'slot_value',
      metadata: { slotSlug: slotSlug ?? null, userId: userId ?? null, count: items.length },
      clientIp: getClientIP(request),
    });
  }

  log.info('Framework slot values listed', {
    count: items.length,
    total,
    page,
    limit,
    slotSlug,
    userId,
    reveal,
  });
  return paginatedResponse(items, { page, limit, total });
});

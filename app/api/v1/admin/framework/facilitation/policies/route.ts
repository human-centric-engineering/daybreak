/**
 * Framework facilitation policies — list + create (f-policies t-1).
 *
 * GET  /api/v1/admin/framework/facilitation/policies[?kind=…] — the typed governance policies,
 *      optionally filtered to one kind.
 * POST /api/v1/admin/framework/facilitation/policies — create a policy
 *      (`{ kind, payload, enabled? }`); 201 with the new policy. The payload is validated against
 *      its kind in the service.
 *
 * Admin-only; framework-tier path (the ESLint config lists `app/api/v1/admin/framework/**` in the
 * framework block). Rate limiting is automatic via `proxy.ts` (CLAUDE.md), so no per-handler
 * limiter. Mutations are audited in the service. The policy management *pages* are `f-ops-views`
 * (15) — this is the API-first surface those pages drive.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { listFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { createFacilitationPolicy } from '@/lib/framework/facilitation/policies/policy-service';
import { createFacilitationPolicyBodySchema } from '@/lib/framework/facilitation/policies/api-schemas';

export const GET = withAdminAuth(async (request) => {
  const log = await getRouteLogger(request);
  const kind = new URL(request.url).searchParams.get('kind') ?? undefined;

  const policies = await listFacilitationPolicies(kind);

  log.info('Framework facilitation policies listed', { count: policies.length, kind });
  return successResponse(policies);
});

export const POST = withAdminAuth(async (request, session) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);

  const body = await validateRequestBody(request, createFacilitationPolicyBodySchema);

  const policy = await createFacilitationPolicy({
    kind: body.kind,
    payload: body.payload,
    enabled: body.enabled,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework facilitation policy created', {
    policyId: policy.id,
    kind: policy.kind,
    adminId: session.user.id,
  });
  return successResponse(policy, undefined, { status: 201 });
});

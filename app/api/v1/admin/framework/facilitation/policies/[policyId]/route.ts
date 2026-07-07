/**
 * Framework facilitation policies — update + delete a single policy (f-policies t-1).
 *
 * PATCH  /api/v1/admin/framework/facilitation/policies/:policyId — update `payload` and/or
 *        `enabled` (`{ payload?, enabled? }`). `kind` is immutable (change = delete + create); a
 *        supplied payload is re-validated against the existing kind.
 * DELETE /api/v1/admin/framework/facilitation/policies/:policyId — delete the policy.
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`; mutations are
 * audited in the service.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import {
  updateFacilitationPolicy,
  deleteFacilitationPolicy,
} from '@/lib/framework/facilitation/policies/policy-service';
import {
  parseFacilitationPolicyId,
  updateFacilitationPolicyBodySchema,
} from '@/lib/framework/facilitation/policies/api-schemas';

export const PATCH = withAdminAuth<{ policyId: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const policyId = parseFacilitationPolicyId((await params).policyId);

  const body = await validateRequestBody(request, updateFacilitationPolicyBodySchema);

  const policy = await updateFacilitationPolicy({
    policyId,
    payload: body.payload,
    enabled: body.enabled,
    userId: session.user.id,
    clientIp,
  });

  log.info('Framework facilitation policy updated', { policyId, adminId: session.user.id });
  return successResponse(policy);
});

export const DELETE = withAdminAuth<{ policyId: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const policyId = parseFacilitationPolicyId((await params).policyId);

  await deleteFacilitationPolicy({ policyId, userId: session.user.id, clientIp });

  log.info('Framework facilitation policy deleted', { policyId, adminId: session.user.id });
  return successResponse({ id: policyId, deleted: true });
});

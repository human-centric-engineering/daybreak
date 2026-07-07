/**
 * Framework structure-change proposal — reject (f-emergence t-3, spec §5.5 F17).
 *
 * POST /api/v1/admin/framework/facilitation/proposals/:proposalId/reject — reject a pending proposal
 * with a required reason (`{ reason }`); nothing is published. 200 with the updated proposal; 400 if
 * already decided.
 *
 * Admin-only; framework-tier path. Audited in the service.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { rejectProposal } from '@/lib/framework/facilitation/emergence/approval';
import {
  parseProposalId,
  rejectProposalBodySchema,
} from '@/lib/framework/facilitation/emergence/api-schemas';

export const POST = withAdminAuth<{ proposalId: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const proposalId = parseProposalId((await params).proposalId);

  const body = await validateRequestBody(request, rejectProposalBodySchema);

  const proposal = await rejectProposal({
    proposalId,
    reviewedBy: session.user.id,
    reason: body.reason,
    clientIp,
  });

  log.info('Structure-change proposal rejected', { proposalId, adminId: session.user.id });
  return successResponse(proposal);
});

/**
 * Framework structure-change proposal — approve (f-emergence t-3, spec §5.5 F17).
 *
 * POST /api/v1/admin/framework/facilitation/proposals/:proposalId/approve — approve a pending
 * proposal: conflict-check, publish its definition as a new map version (author preserved, F17), and
 * mark it published. 200 with the updated proposal; 400 if already decided / the map moved.
 *
 * Admin-only; framework-tier path. Audited in the service.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { approveProposal } from '@/lib/framework/facilitation/emergence/approval';
import { parseProposalId } from '@/lib/framework/facilitation/emergence/api-schemas';

export const POST = withAdminAuth<{ proposalId: string }>(async (request, session, { params }) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);
  const proposalId = parseProposalId((await params).proposalId);

  const proposal = await approveProposal({ proposalId, reviewedBy: session.user.id, clientIp });

  log.info('Structure-change proposal approved + published', {
    proposalId,
    publishedVersionId: proposal.publishedVersionId,
    adminId: session.user.id,
  });
  return successResponse(proposal);
});

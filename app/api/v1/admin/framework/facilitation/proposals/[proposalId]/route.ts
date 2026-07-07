/**
 * Framework structure-change proposal — detail (f-emergence t-3).
 *
 * GET /api/v1/admin/framework/facilitation/proposals/:proposalId — one proposal (404 if unknown).
 *
 * Admin-only; framework-tier path. The approve/reject actions are the sibling `/approve` + `/reject`
 * sub-routes.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getStructureChangeProposal } from '@/lib/framework/facilitation/emergence/proposal-service';
import { parseProposalId } from '@/lib/framework/facilitation/emergence/api-schemas';

export const GET = withAdminAuth<{ proposalId: string }>(async (_request, _session, { params }) => {
  const proposalId = parseProposalId((await params).proposalId);
  const proposal = await getStructureChangeProposal(proposalId);
  return successResponse(proposal);
});

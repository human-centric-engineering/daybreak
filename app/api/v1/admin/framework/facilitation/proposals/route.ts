/**
 * Framework structure-change proposals — list + submit (f-emergence t-3, spec §5.5 F17).
 *
 * GET  /api/v1/admin/framework/facilitation/proposals[?subjectType=&subjectId=&status=] — the
 *      emergence proposal queue, newest first, optionally filtered.
 * POST /api/v1/admin/framework/facilitation/proposals — submit a proposal (`{ subjectType, subjectId,
 *      proposedDefinition, authorAgentSlug? }`); validated then stored as `pending` (201). Consults
 *      the `auto_approval` knob — inert in v1 (`autoApprove: none` + deferred taxonomy), so proposals
 *      stay pending for human approval.
 *
 * Admin-only; framework-tier path. Rate limiting is automatic via `proxy.ts`; mutations are audited
 * in the service. The proposal review UI is `f-ops-views` (15).
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import {
  submitStructureChangeProposal,
  listStructureChangeProposals,
} from '@/lib/framework/facilitation/emergence/proposal-service';
import { approveProposal } from '@/lib/framework/facilitation/emergence/approval';
import {
  getAutoApproveMode,
  isAutoApprovable,
} from '@/lib/framework/facilitation/emergence/auto-approve';
import { formatAgentAuthor } from '@/lib/framework/facilitation/emergence/author';
import { submitProposalBodySchema } from '@/lib/framework/facilitation/emergence/api-schemas';

export const GET = withAdminAuth(async (request) => {
  const log = await getRouteLogger(request);
  const params = new URL(request.url).searchParams;

  const proposals = await listStructureChangeProposals({
    subjectType: params.get('subjectType') ?? undefined,
    subjectId: params.get('subjectId') ?? undefined,
    status: params.get('status') ?? undefined,
  });

  log.info('Structure-change proposals listed', { count: proposals.length });
  return successResponse(proposals);
});

export const POST = withAdminAuth(async (request, session) => {
  const clientIp = getClientIP(request);
  const log = await getRouteLogger(request);

  const body = await validateRequestBody(request, submitProposalBodySchema);
  const createdBy = body.authorAgentSlug
    ? formatAgentAuthor(body.authorAgentSlug)
    : session.user.id;

  const proposal = await submitStructureChangeProposal({
    subjectType: body.subjectType,
    subjectId: body.subjectId,
    proposedDefinition: body.proposedDefinition,
    createdBy,
    actorUserId: session.user.id,
    clientIp,
  });

  // Auto-approval (F17): inert in v1 — `autoApprove: none` + the deferred risk taxonomy mean
  // `isAutoApprovable` is always false, so the proposal stays pending for human approval. Live and
  // correct for when the taxonomy lands.
  let result = proposal;
  if (isAutoApprovable(await getAutoApproveMode(), proposal.riskClass)) {
    result = await approveProposal({ proposalId: proposal.id, reviewedBy: null, clientIp });
  }

  log.info('Structure-change proposal submitted', {
    proposalId: proposal.id,
    status: result.status,
    adminId: session.user.id,
  });
  return successResponse(result, undefined, { status: 201 });
});

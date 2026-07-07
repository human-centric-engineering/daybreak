/**
 * Structure-change proposal approval (f-emergence t-3, spec §5.5 F17) — the "approve / reject"
 * half of the emergence gate. Approving a pending proposal publishes its definition as a new map
 * version (preserving the author, F17: `createdBy = "agent:<slug>"` flows into the version) and marks
 * it published; rejecting records the reason. The deterministic spine is only ever written here,
 * through the validated `publishDefinition` primitive — never raw.
 *
 * Approval is race-safe against DECIDING THE SAME PROPOSAL twice via an optimistic claim:
 * `pending → approved` is an atomic `updateMany` gated on `status = 'pending'`, so two concurrent
 * approvers of one proposal can't both publish (`approved` is the claimed-but-not-yet-published
 * state). If the publish then throws, the claim is rolled back to `pending` — never a stuck
 * `approved` orphan. Conflict detection compares the map's current published version against the
 * proposal's `baseVersion` up front AND re-checks it inside the publish transaction
 * (`expectedBaseVersion`), so a proposal made against a map that has since moved is refused
 * (re-propose). That closes the common case; a residual simultaneous-commit race between two
 * DISTINCT proposals on one map would need a graph-level optimistic-version column (a shared
 * limitation with `publishDraft`/`rollback`, tracked for the map version model).
 */

import type { StructureChangeProposal } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { publishDefinition } from '@/lib/framework/facilitation/map/version-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import { getStructureChangeProposal } from '@/lib/framework/facilitation/emergence/proposal-service';

const ENTITY_TYPE = 'structure_change_proposal';

/** Load a proposal and assert it is still `pending` (only a pending proposal can be decided). */
async function loadPending(proposalId: string): Promise<StructureChangeProposal> {
  const proposal = await getStructureChangeProposal(proposalId); // 404 if missing
  if (proposal.status !== 'pending') {
    throw new ValidationError(`Proposal "${proposalId}" has already been decided`, {
      status: [`Only a pending proposal can be decided (this one is "${proposal.status}")`],
    });
  }
  return proposal;
}

export interface ApproveProposalArgs {
  proposalId: string;
  /** The approving admin, or `null` for a system / auto-approval. */
  reviewedBy: string | null;
  clientIp?: string | null;
}

/**
 * Approve a pending proposal: conflict-check against the current map version, atomically claim it
 * (`pending → approved`), publish its definition as a new version (author preserved), then mark it
 * `published`. Throws `ValidationError` if already decided, claimed concurrently, or the map moved.
 */
export async function approveProposal(args: ApproveProposalArgs): Promise<StructureChangeProposal> {
  const { proposalId, reviewedBy, clientIp } = args;
  const proposal = await loadPending(proposalId);

  // Conflict detection: the map must not have moved since the diff's base.
  const graph = await getGraphDetail(proposal.subjectId); // throws NotFoundError if the map is gone
  const currentVersion = graph.publishedVersion?.version ?? null;
  if (currentVersion !== proposal.baseVersion) {
    throw new ValidationError('The map changed since this proposal was made — please re-propose', {
      baseVersion: [
        `Proposed against version ${proposal.baseVersion ?? 'none'}, but the map is now at ${currentVersion ?? 'none'}`,
      ],
    });
  }

  // Optimistic claim: pending → approved. If another approver won the race, count is 0.
  const claim = await prisma.structureChangeProposal.updateMany({
    where: { id: proposalId, status: 'pending' },
    data: { status: 'approved', reviewedBy },
  });
  if (claim.count === 0) {
    throw new ValidationError(`Proposal "${proposalId}" was decided concurrently`, {
      status: ['The proposal is no longer pending'],
    });
  }

  // Publish the proposed definition as a new version — the author (agent or user) is preserved (F17).
  // `expectedBaseVersion` makes the publish itself conflict-aware (re-checked inside its transaction).
  // If the publish throws (conflict, or a DB error mid-transaction), roll the claim back to `pending`
  // so the proposal is retryable/rejectable rather than a stuck `approved` orphan.
  let version;
  try {
    ({ version } = await publishDefinition({
      slug: proposal.subjectId,
      definition: proposal.proposedDefinition,
      createdBy: proposal.createdBy,
      actorUserId: reviewedBy,
      expectedBaseVersion: proposal.baseVersion,
      changeSummary: `Structure-change proposal ${proposalId}`,
      clientIp,
    }));
  } catch (err) {
    await prisma.structureChangeProposal.updateMany({
      where: { id: proposalId, status: 'approved' },
      data: { status: 'pending', reviewedBy: null },
    });
    throw err;
  }

  const updated = await prisma.structureChangeProposal.update({
    where: { id: proposalId },
    data: { status: 'published', publishedVersionId: version.id },
  });

  logAdminAction({
    userId: reviewedBy,
    action: 'structure_change_proposal.approve',
    entityType: ENTITY_TYPE,
    entityId: proposalId,
    entityName: `${proposal.subjectType}:${proposal.subjectId}`,
    metadata: {
      publishedVersion: version.version,
      author: proposal.createdBy,
      subjectId: proposal.subjectId,
    },
    clientIp: clientIp ?? null,
  });

  return updated;
}

export interface RejectProposalArgs {
  proposalId: string;
  reviewedBy: string;
  reason: string;
  clientIp?: string | null;
}

/** Reject a pending proposal, recording the reason. Nothing is published. */
export async function rejectProposal(args: RejectProposalArgs): Promise<StructureChangeProposal> {
  const { proposalId, reviewedBy, reason, clientIp } = args;
  const proposal = await loadPending(proposalId);

  const updated = await prisma.structureChangeProposal.update({
    where: { id: proposalId },
    data: { status: 'rejected', reviewedBy, rejectionReason: reason },
  });

  logAdminAction({
    userId: reviewedBy,
    action: 'structure_change_proposal.reject',
    entityType: ENTITY_TYPE,
    entityId: proposalId,
    entityName: `${proposal.subjectType}:${proposal.subjectId}`,
    metadata: { reason, subjectId: proposal.subjectId },
    clientIp: clientIp ?? null,
  });

  return updated;
}

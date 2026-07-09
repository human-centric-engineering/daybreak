/**
 * Structure-change proposal approval (f-emergence t-3, spec §5.5 F17; subjects widened in
 * f-governance-plus t-1) — the "approve / reject" half of the emergence gate. Approving a pending
 * proposal APPLIES its definition through the shipped write-service that owns the subject and marks
 * it published; rejecting records the reason. The deterministic spine is only ever written here,
 * through those validated primitives — never raw. Each subject preserves authorship on the proposal
 * row (`createdBy = "agent:<slug>"`); the applied version/policy is attributed to the approving admin
 * (`module_config`/`policy` write-services key `createdBy` off a real `User` FK, so an agent slug
 * cannot be stored there — the proposal is the authorship record):
 *  - `map` — `publishDefinition` writes a new map version (author flows into the version, F17).
 *  - `module_config` — `saveModuleConfig` snapshots a new module config version.
 *  - `policy` — `updateFacilitationPolicy` overwrites the target policy's payload in place (so the
 *    change actually takes effect at enforcement — it does NOT create a duplicate policy row).
 *
 * Approval is race-safe against DECIDING THE SAME PROPOSAL twice via an optimistic claim:
 * `pending → approved` is an atomic `updateMany` gated on `status = 'pending'`, so two concurrent
 * approvers of one proposal can't both apply (`approved` is the claimed-but-not-yet-applied state).
 * If the apply then throws, the claim is rolled back to `pending` — never a stuck `approved` orphan.
 * Conflict detection compares the subject's current version against the proposal's `baseVersion` up
 * front (map + module_config; policy is last-writer-wins on its row), and both the map AND
 * module_config paths ALSO re-check it inside their write transaction (`expectedBaseVersion`), so a
 * proposal made against a map/module that has since moved is refused (re-propose). That closes the
 * common case; a residual simultaneous-commit race between two DISTINCT proposals on one subject
 * would need a subject-level optimistic-version column (a shared limitation with
 * `publishDraft`/`rollback`, tracked for the version models).
 */

import type { StructureChangeProposal } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { publishDefinition } from '@/lib/framework/facilitation/map/version-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import {
  saveModuleConfig,
  getLatestModuleVersionNumber,
} from '@/lib/framework/modules/config/version-service';
import { updateFacilitationPolicy } from '@/lib/framework/facilitation/policies/policy-service';
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

/** The id the apply produced (a version id or policy id) + the subject-specific audit metadata. */
interface ApplyResult {
  publishedVersionId: string;
  auditMeta: Record<string, unknown>;
}

/**
 * Assert the subject has not moved since the proposal's base. Map + module_config carry a version
 * base; policy is last-writer-wins (no base) so this is a no-op for it. Runs BEFORE the claim so a
 * stale proposal is refused without churning its status. Throws `ValidationError` on a conflict,
 * `NotFoundError` if the subject is gone.
 */
async function assertNotMoved(proposal: StructureChangeProposal): Promise<void> {
  let currentVersion: number | null;
  let subjectNoun: string;
  if (proposal.subjectType === 'map') {
    const graph = await getGraphDetail(proposal.subjectId); // throws NotFoundError if the map is gone
    currentVersion = graph.publishedVersion?.version ?? null;
    subjectNoun = 'map';
  } else if (proposal.subjectType === 'module_config') {
    currentVersion = await getLatestModuleVersionNumber(proposal.subjectId); // 404 if the module is gone
    subjectNoun = 'module config';
  } else {
    return; // policy — last-writer-wins, no version base to conflict against
  }

  if (currentVersion !== proposal.baseVersion) {
    throw new ValidationError(
      `The ${subjectNoun} changed since this proposal was made — please re-propose`,
      {
        baseVersion: [
          `Proposed against version ${proposal.baseVersion ?? 'none'}, but it is now at ${currentVersion ?? 'none'}`,
        ],
      }
    );
  }
}

/** `module_config` / `policy` writes are attributed to a real `User` FK, so the approver is required. */
function requireApprover(reviewedBy: string | null, subjectType: string): string {
  if (reviewedBy === null) {
    throw new ValidationError(`A "${subjectType}" proposal requires a human approver`, {
      reviewedBy: [`"${subjectType}" proposals cannot be system-approved in v1`],
    });
  }
  return reviewedBy;
}

/**
 * Apply an already-claimed proposal through the shipped write-service for its subject. Returns the
 * resulting id (stored as `publishedVersionId`) + audit metadata. Any throw here propagates so the
 * caller rolls the claim back to `pending`.
 */
async function applyProposal(
  proposal: StructureChangeProposal,
  reviewedBy: string | null,
  clientIp?: string | null
): Promise<ApplyResult> {
  const changeSummary = `Structure-change proposal ${proposal.id}`;

  if (proposal.subjectType === 'map') {
    // The author (agent or user) is preserved into the version (F17). `expectedBaseVersion` makes the
    // publish itself conflict-aware (re-checked inside its transaction).
    const { version } = await publishDefinition({
      slug: proposal.subjectId,
      definition: proposal.proposedDefinition,
      createdBy: proposal.createdBy,
      actorUserId: reviewedBy,
      expectedBaseVersion: proposal.baseVersion,
      changeSummary,
      clientIp,
    });
    return { publishedVersionId: version.id, auditMeta: { publishedVersion: version.version } };
  }

  if (proposal.subjectType === 'module_config') {
    const userId = requireApprover(reviewedBy, proposal.subjectType);
    // `expectedBaseVersion` makes the save conflict-aware in its own transaction (re-checked there),
    // matching the map path — a stale-base approve is refused rather than clobbering a concurrent save.
    const { version } = await saveModuleConfig({
      slug: proposal.subjectId,
      config: proposal.proposedDefinition,
      userId,
      changeSummary,
      clientIp,
      expectedBaseVersion: proposal.baseVersion,
    });
    return { publishedVersionId: version.id, auditMeta: { moduleVersion: version.version } };
  }

  if (proposal.subjectType === 'policy') {
    const userId = requireApprover(reviewedBy, proposal.subjectType);
    // Overwrite the target policy's payload in place (subjectId is the policy id) so the change takes
    // effect at enforcement; `updateFacilitationPolicy` re-validates the payload against its kind.
    const policy = await updateFacilitationPolicy({
      policyId: proposal.subjectId,
      payload: proposal.proposedDefinition,
      userId,
      clientIp,
    });
    return {
      publishedVersionId: policy.id,
      auditMeta: { policyId: policy.id, policyKind: policy.kind },
    };
  }

  // Defensive — a stored subjectType outside the vocabulary (the CHECK constraint prevents it).
  throw new ValidationError(`Cannot apply proposal of subject "${proposal.subjectType}"`, {
    subjectType: ['Unsupported subject type'],
  });
}

/**
 * Approve a pending proposal: conflict-check the subject hasn't moved, atomically claim it
 * (`pending → approved`), apply it through the subject's shipped write-service (author preserved on
 * the proposal row), then mark it `published`. Throws `ValidationError` if already decided, claimed
 * concurrently, the subject moved, or a `module_config`/`policy` proposal has no human approver.
 */
export async function approveProposal(args: ApproveProposalArgs): Promise<StructureChangeProposal> {
  const { proposalId, reviewedBy, clientIp } = args;
  const proposal = await loadPending(proposalId);

  // Conflict detection (pre-claim): the subject must not have moved since the diff's base.
  await assertNotMoved(proposal);

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

  // Apply through the subject's write-service. If it throws (conflict, missing approver, or a DB
  // error mid-write), roll the claim back to `pending` so the proposal is retryable/rejectable
  // rather than a stuck `approved` orphan.
  let applied: ApplyResult;
  try {
    applied = await applyProposal(proposal, reviewedBy, clientIp);
  } catch (err) {
    await prisma.structureChangeProposal.updateMany({
      where: { id: proposalId, status: 'approved' },
      data: { status: 'pending', reviewedBy: null },
    });
    throw err;
  }

  const updated = await prisma.structureChangeProposal.update({
    where: { id: proposalId },
    data: { status: 'published', publishedVersionId: applied.publishedVersionId },
  });

  logAdminAction({
    userId: reviewedBy,
    action: 'structure_change_proposal.approve',
    entityType: ENTITY_TYPE,
    entityId: proposalId,
    entityName: `${proposal.subjectType}:${proposal.subjectId}`,
    metadata: {
      author: proposal.createdBy,
      subjectId: proposal.subjectId,
      ...applied.auditMeta,
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

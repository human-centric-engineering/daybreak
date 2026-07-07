/**
 * Structure-change proposal service (f-emergence t-2, spec §5.5 F17) — the write + read side of
 * `framework_structure_change_proposal`. This is the "propose" half of the emergence gate: a
 * validated change lands as a **pending** proposal (never written raw to the spine). The
 * approve/reject/publish half — the state transitions + the admin API — is t-3.
 *
 * Submission runs the validation pipeline (`validateProposal`) first, so a proposal that fails Zod
 * shape / referential format / engine invariants is rejected with a clean `ValidationError` and
 * nothing is stored. Every submission is audited. `createdBy` carries the author (`"agent:<slug>"`
 * or a user id); `actorUserId` is who submitted it via the API (for the audit actor).
 */

import { Prisma } from '@prisma/client';
import type { StructureChangeProposal } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import {
  validateProposal,
  type ProposalSubjectType,
} from '@/lib/framework/facilitation/emergence/pipeline';

const ENTITY_TYPE = 'structure_change_proposal';

export interface SubmitProposalArgs {
  subjectType: ProposalSubjectType;
  subjectId: string;
  proposedDefinition: unknown;
  /** The author — `"agent:<slug>"` or a user id (preserved into the published version, F17). */
  createdBy: string;
  /** The admin/user who submitted via the API (audit actor); may differ from an agent `createdBy`. */
  actorUserId?: string | null;
  clientIp?: string | null;
}

/**
 * Submit a structure-change proposal. Validates it (throws on a bad definition / unknown map —
 * nothing is stored), then creates it in `pending` (autoApprove is `none`, so every proposal needs
 * human approval, t-3). Audited.
 */
export async function submitStructureChangeProposal(
  args: SubmitProposalArgs
): Promise<StructureChangeProposal> {
  const { subjectType, subjectId, proposedDefinition, createdBy, actorUserId, clientIp } = args;

  const { definition, baseVersion, riskClass } = await validateProposal(
    subjectType,
    subjectId,
    proposedDefinition
  );

  const proposal = await prisma.structureChangeProposal.create({
    data: {
      subjectType,
      subjectId,
      baseVersion,
      proposedDefinition: definition as Prisma.InputJsonValue,
      status: 'pending',
      riskClass,
      createdBy,
    },
  });

  logAdminAction({
    userId: actorUserId ?? null,
    action: 'structure_change_proposal.submit',
    entityType: ENTITY_TYPE,
    entityId: proposal.id,
    entityName: `${subjectType}:${subjectId}`,
    metadata: { subjectType, subjectId, baseVersion, riskClass, createdBy },
    clientIp: clientIp ?? null,
  });

  return proposal;
}

/** Load a proposal by id, or 404. */
export async function getStructureChangeProposal(id: string): Promise<StructureChangeProposal> {
  const proposal = await prisma.structureChangeProposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError(`Structure-change proposal "${id}" not found`);
  return proposal;
}

export interface ListProposalsFilter {
  subjectType?: string;
  subjectId?: string;
  status?: string;
}

/** List proposals, newest first, optionally filtered by subject/status (uses the composed index). */
export async function listStructureChangeProposals(
  filter: ListProposalsFilter = {}
): Promise<StructureChangeProposal[]> {
  return prisma.structureChangeProposal.findMany({
    where: {
      ...(filter.subjectType !== undefined ? { subjectType: filter.subjectType } : {}),
      ...(filter.subjectId !== undefined ? { subjectId: filter.subjectId } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

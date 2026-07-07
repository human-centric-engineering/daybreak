/**
 * Structure-change proposal service (f-emergence t-2). Mocks the validation pipeline + the DB client
 * + the audit logger; proves submit validates-then-creates-pending + audits, propagates a validation
 * failure without writing, and the get/list reads.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/emergence/pipeline', () => ({ validateProposal: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    structureChangeProposal: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import {
  submitStructureChangeProposal,
  getStructureChangeProposal,
  listStructureChangeProposals,
} from '@/lib/framework/facilitation/emergence/proposal-service';
import { validateProposal } from '@/lib/framework/facilitation/emergence/pipeline';
import { prisma } from '@/lib/db/client';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const row = { id: 'scp-1', subjectType: 'map', subjectId: 'g', status: 'pending' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateProposal).mockResolvedValue({
    definition: { nodes: [] },
    baseVersion: 2,
    riskClass: 'unclassified',
  } as never);
  vi.mocked(prisma.structureChangeProposal.create).mockResolvedValue(row as never);
});

describe('submitStructureChangeProposal', () => {
  it('validates then creates a pending proposal with the resolved fields, and audits it', async () => {
    const proposal = await submitStructureChangeProposal({
      subjectType: 'map',
      subjectId: 'g',
      proposedDefinition: { nodes: [] },
      createdBy: 'agent:onboarding',
      actorUserId: 'admin-1',
    });
    expect(validateProposal).toHaveBeenCalledWith('map', 'g', { nodes: [] });
    expect(vi.mocked(prisma.structureChangeProposal.create).mock.calls[0][0].data).toMatchObject({
      subjectType: 'map',
      subjectId: 'g',
      baseVersion: 2,
      status: 'pending',
      riskClass: 'unclassified',
      createdBy: 'agent:onboarding',
      proposedDefinition: { nodes: [] },
    });
    expect(proposal).toMatchObject({ id: 'scp-1', status: 'pending' });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'structure_change_proposal.submit', userId: 'admin-1' })
    );
  });

  it('propagates a validation failure without writing', async () => {
    vi.mocked(validateProposal).mockRejectedValue(new ValidationError('bad map'));
    await expect(
      submitStructureChangeProposal({
        subjectType: 'map',
        subjectId: 'g',
        proposedDefinition: {},
        createdBy: 'u1',
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.structureChangeProposal.create).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe('getStructureChangeProposal', () => {
  it('returns a proposal by id', async () => {
    vi.mocked(prisma.structureChangeProposal.findUnique).mockResolvedValue(row as never);
    expect(await getStructureChangeProposal('scp-1')).toEqual(row);
  });

  it('404s an unknown proposal', async () => {
    vi.mocked(prisma.structureChangeProposal.findUnique).mockResolvedValue(null);
    await expect(getStructureChangeProposal('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listStructureChangeProposals', () => {
  it('lists newest-first with the given filters', async () => {
    vi.mocked(prisma.structureChangeProposal.findMany).mockResolvedValue([row] as never);
    await listStructureChangeProposals({ subjectType: 'map', status: 'pending' });
    expect(prisma.structureChangeProposal.findMany).toHaveBeenCalledWith({
      where: { subjectType: 'map', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lists all when no filter given', async () => {
    vi.mocked(prisma.structureChangeProposal.findMany).mockResolvedValue([] as never);
    await listStructureChangeProposals();
    expect(prisma.structureChangeProposal.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });
});

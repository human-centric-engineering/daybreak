/**
 * Proposal approval (f-emergence t-3). Mocks the proposal loader, the map query + publish primitive,
 * the DB writes, and the audit logger. Proves approve conflict-checks → claims → publishes →
 * publishes; reject records the reason; and the guard paths (already-decided, map-moved, concurrent
 * claim).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/emergence/proposal-service', () => ({
  getStructureChangeProposal: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/map/queries', () => ({ getGraphDetail: vi.fn() }));
vi.mock('@/lib/framework/facilitation/map/version-service', () => ({ publishDefinition: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { structureChangeProposal: { updateMany: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import { approveProposal, rejectProposal } from '@/lib/framework/facilitation/emergence/approval';
import { getStructureChangeProposal } from '@/lib/framework/facilitation/emergence/proposal-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import { publishDefinition } from '@/lib/framework/facilitation/map/version-service';
import { prisma } from '@/lib/db/client';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { ValidationError } from '@/lib/api/errors';

const proposal = (over: Record<string, unknown> = {}) => ({
  id: 'scp-1',
  subjectType: 'map',
  subjectId: 'onboarding-map',
  baseVersion: 3,
  proposedDefinition: { nodes: [] },
  status: 'pending',
  createdBy: 'agent:onboarding',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStructureChangeProposal).mockResolvedValue(proposal() as never);
  vi.mocked(getGraphDetail).mockResolvedValue({ publishedVersion: { version: 3 } } as never);
  vi.mocked(prisma.structureChangeProposal.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(publishDefinition).mockResolvedValue({ version: { id: 'ver-9', version: 4 } } as never);
  vi.mocked(prisma.structureChangeProposal.update).mockResolvedValue(
    proposal({ status: 'published', publishedVersionId: 'ver-9' }) as never
  );
});

describe('approveProposal', () => {
  it('conflict-checks, claims, publishes (preserving the author), and marks published + audits', async () => {
    const result = await approveProposal({ proposalId: 'scp-1', reviewedBy: 'admin-1' });

    // Claim is gated on status pending (optimistic lock).
    expect(prisma.structureChangeProposal.updateMany).toHaveBeenCalledWith({
      where: { id: 'scp-1', status: 'pending' },
      data: { status: 'approved', reviewedBy: 'admin-1' },
    });
    // Publish preserves the agent author, audits against the admin actor, and pins the base version.
    expect(publishDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'onboarding-map',
        definition: { nodes: [] },
        createdBy: 'agent:onboarding',
        actorUserId: 'admin-1',
        expectedBaseVersion: 3,
      })
    );
    expect(prisma.structureChangeProposal.update).toHaveBeenCalledWith({
      where: { id: 'scp-1' },
      data: { status: 'published', publishedVersionId: 'ver-9' },
    });
    expect(result).toMatchObject({ status: 'published' });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'structure_change_proposal.approve' })
    );
  });

  it('rejects a non-pending proposal (ValidationError, no publish)', async () => {
    vi.mocked(getStructureChangeProposal).mockResolvedValue(
      proposal({ status: 'published' }) as never
    );
    await expect(approveProposal({ proposalId: 'scp-1', reviewedBy: 'a' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it('refuses when the map moved since the proposal (conflict, no publish)', async () => {
    vi.mocked(getGraphDetail).mockResolvedValue({ publishedVersion: { version: 5 } } as never);
    await expect(approveProposal({ proposalId: 'scp-1', reviewedBy: 'a' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(prisma.structureChangeProposal.updateMany).not.toHaveBeenCalled();
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it('refuses when another approver won the claim race (count 0, no publish)', async () => {
    vi.mocked(prisma.structureChangeProposal.updateMany).mockResolvedValue({ count: 0 });
    await expect(approveProposal({ proposalId: 'scp-1', reviewedBy: 'a' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(publishDefinition).not.toHaveBeenCalled();
  });

  it('rolls the claim back to pending when the publish fails (no stuck "approved" orphan)', async () => {
    vi.mocked(publishDefinition).mockRejectedValue(new Error('db exploded mid-publish'));
    await expect(approveProposal({ proposalId: 'scp-1', reviewedBy: 'admin-1' })).rejects.toThrow(
      'db exploded'
    );
    // Claim (pending→approved) then rollback (approved→pending); never marked published.
    expect(prisma.structureChangeProposal.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.structureChangeProposal.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'scp-1', status: 'approved' },
      data: { status: 'pending', reviewedBy: null },
    });
    expect(prisma.structureChangeProposal.update).not.toHaveBeenCalled();
  });

  it('publishes against baseVersion null when the map has no published version', async () => {
    vi.mocked(getStructureChangeProposal).mockResolvedValue(
      proposal({ baseVersion: null }) as never
    );
    vi.mocked(getGraphDetail).mockResolvedValue({ publishedVersion: null } as never);
    await approveProposal({ proposalId: 'scp-1', reviewedBy: 'a' });
    expect(publishDefinition).toHaveBeenCalledOnce();
  });
});

describe('rejectProposal', () => {
  it('marks a pending proposal rejected with the reason and audits it', async () => {
    vi.mocked(prisma.structureChangeProposal.update).mockResolvedValue(
      proposal({ status: 'rejected' }) as never
    );
    await rejectProposal({ proposalId: 'scp-1', reviewedBy: 'admin-1', reason: 'off-scope' });
    expect(prisma.structureChangeProposal.update).toHaveBeenCalledWith({
      where: { id: 'scp-1' },
      data: { status: 'rejected', reviewedBy: 'admin-1', rejectionReason: 'off-scope' },
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'structure_change_proposal.reject' })
    );
  });

  it('rejects a non-pending proposal (ValidationError)', async () => {
    vi.mocked(getStructureChangeProposal).mockResolvedValue(
      proposal({ status: 'rejected' }) as never
    );
    await expect(
      rejectProposal({ proposalId: 'scp-1', reviewedBy: 'a', reason: 'x' })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.structureChangeProposal.update).not.toHaveBeenCalled();
  });
});

/**
 * Facilitation policy service (f-policies t-1). Mocks the DB client + the audit logger; keeps
 * `@prisma/client` + the `kinds` discriminated union real. Proves create (validates + audits),
 * update (payload re-validated against the immutable existing kind; enabled toggle; 404),
 * delete (audits; 404), and the bad-payload → ValidationError path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    facilitationPolicy: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import {
  createFacilitationPolicy,
  updateFacilitationPolicy,
  deleteFacilitationPolicy,
} from '@/lib/framework/facilitation/policies/policy-service';
import { prisma } from '@/lib/db/client';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'fp-1',
  kind: 'auto_approval',
  enabled: true,
  payload: { autoApprove: 'none' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.facilitationPolicy.create).mockResolvedValue(row() as never);
});

describe('createFacilitationPolicy', () => {
  it('creates a valid policy, stamps createdBy, and audits it', async () => {
    const policy = await createFacilitationPolicy({
      kind: 'auto_approval',
      payload: { autoApprove: 'none' },
      userId: 'admin-1',
    });
    expect(policy).toMatchObject({ id: 'fp-1', kind: 'auto_approval' });
    expect(vi.mocked(prisma.facilitationPolicy.create).mock.calls[0][0].data).toMatchObject({
      kind: 'auto_approval',
      payload: { autoApprove: 'none' },
      createdBy: 'admin-1',
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilitation_policy.create', entityName: 'auto_approval' })
    );
  });

  it('rejects a bad payload before any write (ValidationError)', async () => {
    await expect(
      createFacilitationPolicy({
        kind: 'auto_approval',
        payload: { autoApprove: 'bad' },
        userId: 'a',
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.facilitationPolicy.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown kind before any write (ValidationError)', async () => {
    await expect(
      createFacilitationPolicy({ kind: 'made_up', payload: {}, userId: 'a' })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.facilitationPolicy.create).not.toHaveBeenCalled();
  });
});

describe('updateFacilitationPolicy', () => {
  beforeEach(() => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue({
      id: 'fp-1',
      kind: 'auto_approval',
    } as never);
    vi.mocked(prisma.facilitationPolicy.update).mockResolvedValue(row() as never);
  });

  it('re-validates a new payload against the existing kind and updates', async () => {
    await updateFacilitationPolicy({
      policyId: 'fp-1',
      payload: { autoApprove: 'low_risk' },
      userId: 'a',
    });
    expect(vi.mocked(prisma.facilitationPolicy.update).mock.calls[0][0].data).toMatchObject({
      payload: { autoApprove: 'low_risk' },
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilitation_policy.update' })
    );
  });

  it('toggles enabled without a payload', async () => {
    await updateFacilitationPolicy({ policyId: 'fp-1', enabled: false, userId: 'a' });
    expect(vi.mocked(prisma.facilitationPolicy.update).mock.calls[0][0].data).toEqual({
      enabled: false,
    });
  });

  it('rejects a new payload that does not match the existing kind (ValidationError, no write)', async () => {
    await expect(
      updateFacilitationPolicy({ policyId: 'fp-1', payload: { autoApprove: 'bad' }, userId: 'a' })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.facilitationPolicy.update).not.toHaveBeenCalled();
  });

  it('404s an unknown policy (no write)', async () => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue(null);
    await expect(
      updateFacilitationPolicy({ policyId: 'nope', enabled: false, userId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.facilitationPolicy.update).not.toHaveBeenCalled();
  });

  it('maps a concurrent-delete P2025 to a clean 404', async () => {
    vi.mocked(prisma.facilitationPolicy.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 't' })
    );
    await expect(
      updateFacilitationPolicy({ policyId: 'fp-1', enabled: true, userId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteFacilitationPolicy', () => {
  it('deletes an existing policy and audits it', async () => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue({
      id: 'fp-1',
      kind: 'auto_approval',
    } as never);
    vi.mocked(prisma.facilitationPolicy.delete).mockResolvedValue(row() as never);
    await deleteFacilitationPolicy({ policyId: 'fp-1', userId: 'a' });
    expect(prisma.facilitationPolicy.delete).toHaveBeenCalledWith({ where: { id: 'fp-1' } });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilitation_policy.delete', entityName: 'auto_approval' })
    );
  });

  it('404s an unknown policy (no delete)', async () => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue(null);
    await expect(
      deleteFacilitationPolicy({ policyId: 'nope', userId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.facilitationPolicy.delete).not.toHaveBeenCalled();
  });

  it('maps a concurrent-delete P2025 to a clean 404', async () => {
    vi.mocked(prisma.facilitationPolicy.findUnique).mockResolvedValue({
      id: 'fp-1',
      kind: 'auto_approval',
    } as never);
    vi.mocked(prisma.facilitationPolicy.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 't' })
    );
    await expect(
      deleteFacilitationPolicy({ policyId: 'fp-1', userId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

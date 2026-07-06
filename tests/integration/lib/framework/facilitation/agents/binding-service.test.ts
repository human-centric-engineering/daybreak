/**
 * Facilitation agent-binding service (f-facilitation-agents t-1). Mocks the DB client + the
 * audit logger; keeps `@prisma/client` real so the P2002 seat-taken path raises a genuine
 * `PrismaClientKnownRequestError`, and keeps `FACILITATION_ROLES` real. Proves seat validation,
 * the agent-exists check, the `@@unique([role])` → clean-4xx mapping, config update, and unbind.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiAgent: { findFirst: vi.fn() },
    facilitationAgentBinding: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import {
  bindFacilitationAgent,
  updateFacilitationBinding,
  unbindFacilitationAgent,
} from '@/lib/framework/facilitation/agents/binding-service';
import { prisma } from '@/lib/db/client';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const bindArgs = (over: Record<string, unknown> = {}) => ({
  agentId: 'agent-1',
  role: 'onboarding',
  userId: 'admin-1',
  ...over,
});
const seatTaken = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 't',
    meta: { target: ['role'] },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.aiAgent.findFirst).mockResolvedValue({ id: 'agent-1' } as never);
  vi.mocked(prisma.facilitationAgentBinding.create).mockResolvedValue({
    id: 'fab-1',
    agentId: 'agent-1',
    role: 'onboarding',
  } as never);
});

describe('bindFacilitationAgent', () => {
  it('binds an agent to a valid seat and audits it', async () => {
    const binding = await bindFacilitationAgent(bindArgs());
    expect(binding).toMatchObject({ id: 'fab-1', role: 'onboarding' });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'facilitation_agent_binding.create',
        entityName: 'onboarding',
      })
    );
  });

  it('rejects a role that is not a facilitation seat (ValidationError, no write)', async () => {
    await expect(bindFacilitationAgent(bindArgs({ role: 'made_up' }))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(prisma.facilitationAgentBinding.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown or soft-deleted agent (ValidationError)', async () => {
    vi.mocked(prisma.aiAgent.findFirst).mockResolvedValue(null);
    await expect(bindFacilitationAgent(bindArgs())).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.facilitationAgentBinding.create).not.toHaveBeenCalled();
  });

  it('maps the @@unique([role]) seat-taken race to a clean ValidationError, not a raw 500', async () => {
    vi.mocked(prisma.facilitationAgentBinding.create).mockRejectedValue(seatTaken());
    await expect(bindFacilitationAgent(bindArgs())).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateFacilitationBinding', () => {
  it('updates the config of an existing binding', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findUnique).mockResolvedValue({
      id: 'fab-1',
      agentId: 'agent-1',
      role: 'onboarding',
    } as never);
    vi.mocked(prisma.facilitationAgentBinding.update).mockResolvedValue({
      id: 'fab-1',
      role: 'onboarding',
    } as never);
    await updateFacilitationBinding({ bindingId: 'fab-1', config: { tone: 'warm' }, userId: 'a' });
    expect(prisma.facilitationAgentBinding.update).toHaveBeenCalledWith({
      where: { id: 'fab-1' },
      data: { config: { tone: 'warm' } },
    });
  });

  it('clears config when passed null', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findUnique).mockResolvedValue({
      id: 'fab-1',
      agentId: 'agent-1',
      role: 'onboarding',
    } as never);
    vi.mocked(prisma.facilitationAgentBinding.update).mockResolvedValue({
      id: 'fab-1',
      role: 'onboarding',
    } as never);
    await updateFacilitationBinding({ bindingId: 'fab-1', config: null, userId: 'a' });
    expect(vi.mocked(prisma.facilitationAgentBinding.update).mock.calls[0][0].data.config).toBe(
      Prisma.JsonNull
    );
  });

  it('404s an unknown binding (no write)', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findUnique).mockResolvedValue(null);
    await expect(
      updateFacilitationBinding({ bindingId: 'nope', config: null, userId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.facilitationAgentBinding.update).not.toHaveBeenCalled();
  });
});

describe('unbindFacilitationAgent', () => {
  it('removes a binding and audits it', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findUnique).mockResolvedValue({
      id: 'fab-1',
      agentId: 'agent-1',
      role: 'state',
    } as never);
    vi.mocked(prisma.facilitationAgentBinding.delete).mockResolvedValue({} as never);
    await unbindFacilitationAgent({ bindingId: 'fab-1', userId: 'a' });
    expect(prisma.facilitationAgentBinding.delete).toHaveBeenCalledWith({ where: { id: 'fab-1' } });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilitation_agent_binding.delete', entityName: 'state' })
    );
  });

  it('404s an unknown binding (no delete)', async () => {
    vi.mocked(prisma.facilitationAgentBinding.findUnique).mockResolvedValue(null);
    await expect(
      unbindFacilitationAgent({ bindingId: 'nope', userId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.facilitationAgentBinding.delete).not.toHaveBeenCalled();
  });
});

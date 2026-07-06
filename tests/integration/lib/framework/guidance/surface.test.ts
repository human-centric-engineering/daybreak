/**
 * Module surface resolution (f-guidance t-5, X5). Mocks the binding query + the conversation
 * lookup. Proves the primary-agent pick (filtering inactive/tombstoned agents), the
 * resume-vs-new decision, the scope.moduleSlug write, and the null / not-found paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: { findFirst: vi.fn() },
    aiAgent: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/framework/modules/bindings/queries', () => ({ listModuleBindings: vi.fn() }));

import { resolveModuleSurface } from '@/lib/framework/guidance/surface';
import { prisma } from '@/lib/db/client';
import { listModuleBindings } from '@/lib/framework/modules/bindings/queries';

const agent = (over: Record<string, unknown> = {}) => ({
  id: 'agent-1',
  slug: 'coach',
  name: 'Coach',
  isActive: true,
  deletedAt: null,
  ...over,
});
const binding = (over: Record<string, unknown> = {}) => ({
  isPrimary: true,
  agent: agent(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);
  // Default: the bound agent is public + no rate override.
  vi.mocked(prisma.aiAgent.findUnique).mockResolvedValue({
    visibility: 'public',
    rateLimitRpm: null,
  } as never);
});

describe('resolveModuleSurface', () => {
  it('resolves the public primary agent + scope, opening a new conversation when none exists', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([binding()] as never);
    const surface = await resolveModuleSurface('user-1', 'onboarding');
    expect(surface).toEqual({
      agentSlug: 'coach',
      agentId: 'agent-1',
      conversationId: undefined,
      scope: { moduleSlug: 'onboarding' }, // the X5 write
      rateLimitRpm: null,
    });
  });

  it('gates on visibility — an internal (default) bound agent yields no surface (→ null)', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([binding()] as never);
    vi.mocked(prisma.aiAgent.findUnique).mockResolvedValue({
      visibility: 'internal',
      rateLimitRpm: null,
    } as never);
    expect(await resolveModuleSurface('user-1', 'onboarding')).toBeNull();
    expect(prisma.aiConversation.findFirst).not.toHaveBeenCalled(); // gated before any conversation work
  });

  it('carries the agent rate-limit override through', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([binding()] as never);
    vi.mocked(prisma.aiAgent.findUnique).mockResolvedValue({
      visibility: 'public',
      rateLimitRpm: 3,
    } as never);
    expect((await resolveModuleSurface('user-1', 'onboarding'))?.rateLimitRpm).toBe(3);
  });

  it('resumes the most-recent active surface conversation for the (user, agent, module)', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([binding()] as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue({ id: 'conv-9' } as never);
    const surface = await resolveModuleSurface('user-1', 'onboarding');
    expect(surface?.conversationId).toBe('conv-9');
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        agentId: 'agent-1',
        contextType: 'module',
        contextId: 'onboarding',
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  });

  it('returns null when the module has no primary binding', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([binding({ isPrimary: false })] as never);
    expect(await resolveModuleSurface('user-1', 'onboarding')).toBeNull();
    expect(prisma.aiConversation.findFirst).not.toHaveBeenCalled();
  });

  it('filters an inactive or tombstoned primary agent (→ null)', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([
      binding({ agent: agent({ isActive: false }) }),
    ] as never);
    expect(await resolveModuleSurface('user-1', 'onboarding')).toBeNull();

    vi.mocked(listModuleBindings).mockResolvedValue([
      binding({ agent: agent({ deletedAt: new Date('2026-01-01') }) }),
    ] as never);
    expect(await resolveModuleSurface('user-1', 'onboarding')).toBeNull();
  });

  it('returns null when the primary binding has no stitched agent (soft-deleted)', async () => {
    vi.mocked(listModuleBindings).mockResolvedValue([binding({ agent: null })] as never);
    expect(await resolveModuleSurface('user-1', 'onboarding')).toBeNull();
  });

  it('propagates NotFoundError for an unknown module slug', async () => {
    vi.mocked(listModuleBindings).mockRejectedValue(new Error('Module "nope" not found'));
    await expect(resolveModuleSurface('user-1', 'nope')).rejects.toThrow('not found');
  });
});

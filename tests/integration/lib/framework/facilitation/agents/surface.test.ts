/**
 * Facilitation surface resolution (f-facilitation-agents t-2). Mocks the by-role binding query +
 * the conversation lookup. Proves the role → bound-agent resolve (filtering inactive/tombstoned/
 * missing agents), the `public`-visibility gate, the resume-vs-new decision, the rate-override
 * carry-through, and — the point of decision 4 — that NO `scope` is populated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: { findFirst: vi.fn() },
    aiAgent: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/framework/facilitation/agents/binding-queries', () => ({
  getFacilitationBindingByRole: vi.fn(),
}));

import { resolveFacilitationSurface } from '@/lib/framework/facilitation/agents/surface';
import { prisma } from '@/lib/db/client';
import { getFacilitationBindingByRole } from '@/lib/framework/facilitation/agents/binding-queries';

const agent = (over: Record<string, unknown> = {}) => ({
  id: 'agent-1',
  slug: 'welcomer',
  name: 'Welcomer',
  isActive: true,
  deletedAt: null,
  ...over,
});
const binding = (over: Record<string, unknown> = {}) => ({
  id: 'fab-1',
  agentId: 'agent-1',
  role: 'onboarding',
  config: null,
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

describe('resolveFacilitationSurface', () => {
  it('resolves the public bound agent with NO scope, opening a new conversation when none exists', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(binding() as never);
    const surface = await resolveFacilitationSurface('user-1', 'onboarding');
    expect(surface).toEqual({
      agentSlug: 'welcomer',
      agentId: 'agent-1',
      conversationId: undefined,
      rateLimitRpm: null,
    });
    // Decision 4: facilitation carries no scope map, unlike the module surface.
    expect(surface).not.toHaveProperty('scope');
  });

  it('gates on visibility — an internal (default) bound agent yields no surface (→ null)', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(binding() as never);
    vi.mocked(prisma.aiAgent.findUnique).mockResolvedValue({
      visibility: 'internal',
      rateLimitRpm: null,
    } as never);
    expect(await resolveFacilitationSurface('user-1', 'onboarding')).toBeNull();
    expect(prisma.aiConversation.findFirst).not.toHaveBeenCalled(); // gated before any conversation work
  });

  it('carries the agent rate-limit override through', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(binding() as never);
    vi.mocked(prisma.aiAgent.findUnique).mockResolvedValue({
      visibility: 'public',
      rateLimitRpm: 5,
    } as never);
    expect((await resolveFacilitationSurface('user-1', 'onboarding'))?.rateLimitRpm).toBe(5);
  });

  it('resumes the most-recent active surface conversation for the (user, agent, role)', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(binding() as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue({ id: 'conv-9' } as never);
    const surface = await resolveFacilitationSurface('user-1', 'onboarding');
    expect(surface?.conversationId).toBe('conv-9');
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        agentId: 'agent-1',
        contextType: 'facilitation',
        contextId: 'onboarding',
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  });

  it('returns null for an unknown or unbound role (no binding, no error thrown)', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(null);
    expect(await resolveFacilitationSurface('user-1', 'made-up')).toBeNull();
    expect(prisma.aiConversation.findFirst).not.toHaveBeenCalled();
  });

  it('filters an inactive or tombstoned bound agent (→ null)', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(
      binding({ agent: agent({ isActive: false }) }) as never
    );
    expect(await resolveFacilitationSurface('user-1', 'onboarding')).toBeNull();

    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(
      binding({ agent: agent({ deletedAt: new Date('2026-01-01') }) }) as never
    );
    expect(await resolveFacilitationSurface('user-1', 'onboarding')).toBeNull();
    expect(prisma.aiConversation.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the binding has no stitched agent (hard-deleted between reads)', async () => {
    vi.mocked(getFacilitationBindingByRole).mockResolvedValue(binding({ agent: null }) as never);
    expect(await resolveFacilitationSurface('user-1', 'onboarding')).toBeNull();
  });
});

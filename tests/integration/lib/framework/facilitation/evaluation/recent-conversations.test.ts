/**
 * Recent un-scored framework conversations (f-governance-plus t-3). Mocks the three DB reads; proves
 * the watermark (a conversation is pending iff it has an assistant turn with no eval row), the
 * recency order, the maxConversations cap, and the empty short-circuits.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: { findMany: vi.fn() },
    aiMessage: { findMany: vi.fn() },
    frameworkConversationEval: { findMany: vi.fn() },
  },
}));

import { listRecentUnscoredFrameworkConversations } from '@/lib/framework/facilitation/evaluation/recent-conversations';
import { prisma } from '@/lib/db/client';

const conv = (id: string) => ({ id, contextType: 'facilitation', contextId: 'onboarding' });

beforeEach(() => {
  vi.clearAllMocks();
  // Window: c1 (newest) → c2 → c3.
  vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([
    conv('c1'),
    conv('c2'),
    conv('c3'),
  ] as never);
  // Assistant turns: c1 has m1; c2 has m2; c3 has m3.
  vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
    { id: 'm1', conversationId: 'c1' },
    { id: 'm2', conversationId: 'c2' },
    { id: 'm3', conversationId: 'c3' },
  ] as never);
  // m2 already scored → c2 excluded.
  vi.mocked(prisma.frameworkConversationEval.findMany).mockResolvedValue([
    { messageId: 'm2' },
  ] as never);
});

describe('listRecentUnscoredFrameworkConversations', () => {
  it('returns only conversations with an un-scored turn, newest first', async () => {
    const result = await listRecentUnscoredFrameworkConversations(10);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c3']); // c2 fully scored → excluded
    expect(result[0]).toMatchObject({ contextType: 'facilitation', contextId: 'onboarding' });
  });

  it('caps the result at maxConversations, preserving recency order', async () => {
    // Nothing scored → all three pending; cap to 2 → the two newest.
    vi.mocked(prisma.frameworkConversationEval.findMany).mockResolvedValue([] as never);
    const result = await listRecentUnscoredFrameworkConversations(2);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('returns [] when there are no framework conversations', async () => {
    vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([] as never);
    expect(await listRecentUnscoredFrameworkConversations(10)).toEqual([]);
    expect(prisma.aiMessage.findMany).not.toHaveBeenCalled();
  });

  it('returns [] when the window has no assistant turns', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([] as never);
    expect(await listRecentUnscoredFrameworkConversations(10)).toEqual([]);
    expect(prisma.frameworkConversationEval.findMany).not.toHaveBeenCalled();
  });

  it('filters conversations to the framework surfaces via the query', async () => {
    await listRecentUnscoredFrameworkConversations(10);
    expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contextType: { in: expect.arrayContaining(['facilitation', 'module']) } },
        orderBy: { updatedAt: 'desc' },
      })
    );
  });
});

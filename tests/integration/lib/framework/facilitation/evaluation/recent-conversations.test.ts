/**
 * Recent un-scored framework conversations (f-governance-plus t-3). Mocks the three DB reads; proves
 * the conversation-level watermark (a conversation is pending iff it has assistant turns but NO eval
 * row at all — so a partially-scored conversation is EXCLUDED), the recency order, the
 * maxConversations cap, the empty short-circuits, and the saturation warning.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: { findMany: vi.fn() },
    aiMessage: { findMany: vi.fn() },
    frameworkConversationEval: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { listRecentUnscoredFrameworkConversations } from '@/lib/framework/facilitation/evaluation/recent-conversations';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';

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
  it('returns only never-scored conversations, newest first', async () => {
    const result = await listRecentUnscoredFrameworkConversations(10);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c3']); // c2 has a scored turn → excluded
    expect(result[0]).toMatchObject({ contextType: 'facilitation', contextId: 'onboarding' });
  });

  it('EXCLUDES a partially-scored conversation (has one scored + one un-scored turn)', async () => {
    // c1 has m1 (unscored) AND m1b (scored) → it has a scored turn → excluded (never re-swept).
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      { id: 'm1', conversationId: 'c1' },
      { id: 'm1b', conversationId: 'c1' },
      { id: 'm3', conversationId: 'c3' },
    ] as never);
    vi.mocked(prisma.frameworkConversationEval.findMany).mockResolvedValue([
      { messageId: 'm1b' },
    ] as never);
    const result = await listRecentUnscoredFrameworkConversations(10);
    expect(result.map((c) => c.id)).toEqual(['c3']); // c1 excluded despite its un-scored m1
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

  it('warns when the scan window saturates but the selection is not filled (coverage may lag)', async () => {
    // maxConversations 10 → scan window floor 100. A full window of 100, ALL already scored → no
    // candidates but the window is saturated: warn so an operator sees coverage may be behind.
    const full = Array.from({ length: 100 }, (_, i) => ({
      id: `c${i}`,
      contextType: 'facilitation',
      contextId: 'x',
    }));
    vi.mocked(prisma.aiConversation.findMany).mockResolvedValue(full as never);
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue(
      full.map((c) => ({ id: `m-${c.id}`, conversationId: c.id })) as never
    );
    vi.mocked(prisma.frameworkConversationEval.findMany).mockResolvedValue(
      full.map((c) => ({ messageId: `m-${c.id}` })) as never
    );
    const result = await listRecentUnscoredFrameworkConversations(10);
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'framework eval sweep: conversation scan window saturated',
      expect.objectContaining({ scanWindow: 100 })
    );
  });
});

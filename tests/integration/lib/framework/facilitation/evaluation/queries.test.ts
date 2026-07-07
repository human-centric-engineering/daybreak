/**
 * Framework conversation-eval read queries (f-eval t-1). Mocks the DB client.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { frameworkConversationEval: { findMany: vi.fn() } },
}));

import { listConversationEvals } from '@/lib/framework/facilitation/evaluation/queries';
import { prisma } from '@/lib/db/client';

beforeEach(() => vi.clearAllMocks());

describe('listConversationEvals', () => {
  it('lists a conversation eval rows, most-recently-scored first', async () => {
    vi.mocked(prisma.frameworkConversationEval.findMany).mockResolvedValue([{ id: 'e1' }] as never);
    await listConversationEvals('c1');
    expect(prisma.frameworkConversationEval.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'c1' },
      orderBy: { scoredAt: 'desc' },
    });
  });
});

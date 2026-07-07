/**
 * Framework conversation scoring (f-eval t-1). Mocks the DB client, the turn reader, the scorer, and
 * the audit logger. Proves the framework-surface gate, per-turn score + upsert + cost-sum, the
 * skip-a-failing-turn path, and audit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: { findUnique: vi.fn() },
    frameworkConversationEval: { upsert: vi.fn() },
  },
}));
vi.mock('@/lib/framework/facilitation/evaluation/turns', () => ({ listScorableTurns: vi.fn() }));
vi.mock('@/lib/orchestration/evaluations/score-response', () => ({ scoreResponse: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import { scoreConversation } from '@/lib/framework/facilitation/evaluation/score-conversation';
import { prisma } from '@/lib/db/client';
import { listScorableTurns } from '@/lib/framework/facilitation/evaluation/turns';
import { scoreResponse } from '@/lib/orchestration/evaluations/score-response';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const turn = (id: string) => ({ messageId: id, userQuestion: 'Q', aiResponse: 'A', citations: [] });
const scores = {
  faithfulness: { score: 0.9, reasoning: 'f' },
  groundedness: { score: 0.8, reasoning: 'g' },
  relevance: { score: 1, reasoning: 'r' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue({
    id: 'c1',
    contextType: 'facilitation',
    contextId: 'onboarding',
  } as never);
  vi.mocked(listScorableTurns).mockResolvedValue([turn('a1'), turn('a2')] as never);
  vi.mocked(scoreResponse).mockResolvedValue({ scores, costUsd: 0.01 });
  vi.mocked(prisma.frameworkConversationEval.upsert).mockImplementation((async ({
    where,
  }: never) => ({ id: 'e', messageId: (where as { messageId: string }).messageId })) as never);
});

describe('scoreConversation', () => {
  it('scores each turn, upserts per message, sums cost, and audits', async () => {
    const result = await scoreConversation({ conversationId: 'c1', actorUserId: 'admin-1' });
    expect(result).toMatchObject({ scoredTurns: 2, skippedTurns: 0, totalCostUsd: 0.02 });
    expect(scoreResponse).toHaveBeenCalledTimes(2);
    expect(scoreResponse).toHaveBeenCalledWith(
      expect.objectContaining({ userQuestion: 'Q', aiResponse: 'A', userId: 'admin-1' })
    );
    // upsert keyed on the turn's messageId, with the mapped scores.
    expect(vi.mocked(prisma.frameworkConversationEval.upsert).mock.calls[0][0]).toMatchObject({
      where: { messageId: 'a1' },
      create: {
        messageId: 'a1',
        contextType: 'facilitation',
        faithfulness: 0.9,
        groundedness: 0.8,
        relevance: 1,
      },
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'framework_conversation_eval.score' })
    );
  });

  it('404s an unknown conversation', async () => {
    vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue(null);
    await expect(
      scoreConversation({ conversationId: 'nope', actorUserId: 'a' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a non-framework conversation (ValidationError, no scoring)', async () => {
    vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue({
      id: 'c1',
      contextType: 'evaluation',
      contextId: null,
    } as never);
    await expect(
      scoreConversation({ conversationId: 'c1', actorUserId: 'a' })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(scoreResponse).not.toHaveBeenCalled();
  });

  it('accepts a module-surface conversation', async () => {
    vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue({
      id: 'c1',
      contextType: 'module',
      contextId: 'reading',
    } as never);
    vi.mocked(listScorableTurns).mockResolvedValue([turn('a1')] as never);
    expect((await scoreConversation({ conversationId: 'c1', actorUserId: 'a' })).scoredTurns).toBe(
      1
    );
  });

  it('skips a turn whose scoring throws (partial result, not fatal)', async () => {
    vi.mocked(scoreResponse)
      .mockResolvedValueOnce({ scores, costUsd: 0.01 })
      .mockRejectedValueOnce(new Error('no active provider'));
    const result = await scoreConversation({ conversationId: 'c1', actorUserId: 'a' });
    expect(result).toMatchObject({ scoredTurns: 1, skippedTurns: 1, totalCostUsd: 0.01 });
    expect(prisma.frameworkConversationEval.upsert).toHaveBeenCalledTimes(1);
  });
});

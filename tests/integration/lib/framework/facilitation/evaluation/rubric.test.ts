/**
 * Framework-rubric scoring (f-governance-plus t-3). Mocks the DB client, the framework-conversation
 * loader (via aiConversation), the turn reader, the judge driver, and the audit logger. Proves the
 * per-turn rubric upsert into `rubricScore`, the reasoning merge (never clobbering the metric
 * scorer's), the skip-on-judge-failure path, and cost accumulation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: { findUnique: vi.fn() },
    frameworkConversationEval: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock('@/lib/framework/facilitation/evaluation/turns', () => ({ listScorableTurns: vi.fn() }));
vi.mock('@/lib/orchestration/evaluations/judge-driver', () => ({ driveJudgeAgent: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import { rubricScoreConversation } from '@/lib/framework/facilitation/evaluation/rubric';
import { prisma } from '@/lib/db/client';
import { listScorableTurns } from '@/lib/framework/facilitation/evaluation/turns';
import { driveJudgeAgent } from '@/lib/orchestration/evaluations/judge-driver';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';

const turn = (id: string) => ({ messageId: id, userQuestion: 'Q', aiResponse: 'A', citations: [] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue({
    id: 'c1',
    contextType: 'facilitation',
    contextId: 'onboarding',
  } as never);
  vi.mocked(listScorableTurns).mockResolvedValue([turn('a1'), turn('a2')] as never);
  vi.mocked(prisma.frameworkConversationEval.findUnique).mockResolvedValue(null);
  vi.mocked(driveJudgeAgent).mockResolvedValue({
    score: 0.8,
    reasoning: 'served the purpose',
    evaluationSteps: ['s1'],
    costUsd: 0.002,
    tokenUsage: { input: 10, output: 5 },
  });
  vi.mocked(prisma.frameworkConversationEval.upsert).mockImplementation((async ({
    where,
  }: never) => ({ id: 'e', messageId: (where as { messageId: string }).messageId })) as never);
});

describe('rubricScoreConversation', () => {
  it('drives the framework-rubric judge per turn and upserts the score + summed cost', async () => {
    const result = await rubricScoreConversation({ conversationId: 'c1', actorUserId: 'sys' });

    expect(driveJudgeAgent).toHaveBeenCalledTimes(2);
    expect(driveJudgeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentSlug: 'eval-judge-framework-rubric', userId: 'sys' })
    );
    expect(result).toMatchObject({ scoredTurns: 2, skippedTurns: 0 });
    expect(result.totalCostUsd).toBeCloseTo(0.004, 6);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'framework_conversation_eval.rubric' })
    );
  });

  it('maps the turn citations into the judge citation shape (defaults for absent fields)', async () => {
    vi.mocked(listScorableTurns).mockResolvedValue([
      {
        messageId: 'a1',
        userQuestion: 'Q',
        aiResponse: 'A',
        citations: [{ marker: 5, documentName: 'guide', excerpt: 'ex' }, {}],
      },
    ] as never);
    await rubricScoreConversation({ conversationId: 'c1', actorUserId: 'sys' });
    expect(driveJudgeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        citations: [
          { marker: 5, documentName: 'guide', excerpt: 'ex' },
          { marker: 2, documentName: null, excerpt: '' }, // absent fields → index+1 / null / ''
        ],
      })
    );
  });

  it('writes rubricScore on create and merges reasoning under a rubric key', async () => {
    await rubricScoreConversation({ conversationId: 'c1', actorUserId: 'sys' });
    expect(prisma.frameworkConversationEval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId: 'a1' },
        create: expect.objectContaining({
          messageId: 'a1',
          rubricScore: 0.8,
          judgeReasoning: { rubric: { reasoning: 'served the purpose', steps: ['s1'] } },
          costUsd: 0.002,
        }),
        update: expect.objectContaining({
          rubricScore: 0.8,
          costUsd: { increment: 0.002 },
        }),
      })
    );
  });

  it('merges the rubric reasoning into an existing metric-scorer blob (no clobber)', async () => {
    vi.mocked(prisma.frameworkConversationEval.findUnique).mockResolvedValue({
      judgeReasoning: { faithfulness: { reasoning: 'f' } },
    } as never);
    await rubricScoreConversation({ conversationId: 'c1', actorUserId: 'sys' });
    expect(prisma.frameworkConversationEval.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          judgeReasoning: {
            faithfulness: { reasoning: 'f' },
            rubric: { reasoning: 'served the purpose', steps: ['s1'] },
          },
        }),
      })
    );
  });

  it('skips a turn whose judge failed (score null) — no write, counted as skipped, cost still summed', async () => {
    vi.mocked(driveJudgeAgent)
      .mockResolvedValueOnce({
        score: null,
        reasoning: 'judge error',
        costUsd: 0.001,
        tokenUsage: { input: 0, output: 0 },
        errorCode: 'provider_down',
      })
      .mockResolvedValueOnce({
        score: 0.6,
        reasoning: 'ok',
        costUsd: 0.001,
        tokenUsage: { input: 1, output: 1 },
      });
    const result = await rubricScoreConversation({ conversationId: 'c1', actorUserId: 'sys' });
    expect(result).toMatchObject({ scoredTurns: 1, skippedTurns: 1 });
    expect(prisma.frameworkConversationEval.upsert).toHaveBeenCalledTimes(1);
    expect(result.totalCostUsd).toBeCloseTo(0.002, 6);
  });
});

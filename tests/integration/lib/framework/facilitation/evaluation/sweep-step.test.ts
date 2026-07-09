/**
 * Scheduled eval sweep step (f-governance-plus t-3). Mocks the conversation selector, the three eval
 * passes, and the DB (service-account fallback). Proves the default passes (supervise+rubric, not
 * score), the opt-in metric pass, per-conversation failure isolation, the in-loop budget fence, the
 * actor fallback to the service account, and config validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { user: { findFirst: vi.fn() } } }));
vi.mock('@/lib/framework/facilitation/evaluation/recent-conversations', () => ({
  listRecentUnscoredFrameworkConversations: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/evaluation/score-conversation', () => ({
  scoreConversation: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/evaluation/supervise', () => ({
  superviseConversation: vi.fn(),
}));
vi.mock('@/lib/framework/facilitation/evaluation/rubric', () => ({
  rubricScoreConversation: vi.fn(),
}));

import { executeEvalSweep } from '@/lib/framework/facilitation/evaluation/sweep-step';
import { prisma } from '@/lib/db/client';
import { listRecentUnscoredFrameworkConversations } from '@/lib/framework/facilitation/evaluation/recent-conversations';
import { scoreConversation } from '@/lib/framework/facilitation/evaluation/score-conversation';
import { superviseConversation } from '@/lib/framework/facilitation/evaluation/supervise';
import { rubricScoreConversation } from '@/lib/framework/facilitation/evaluation/rubric';
import { ExecutorError } from '@/lib/orchestration/engine/errors';

const step = (config: unknown = {}) => ({ id: 'step-1', config }) as never;
const ctx = (over: Record<string, unknown> = {}) =>
  ({
    userId: 'admin-1',
    totalCostUsd: 0,
    logger: { warn: vi.fn() },
    ...over,
  }) as never;

const convo = (id: string) => ({ id, contextType: 'facilitation', contextId: 'onboarding' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRecentUnscoredFrameworkConversations).mockResolvedValue([
    convo('c1'),
    convo('c2'),
  ] as never);
  vi.mocked(scoreConversation).mockResolvedValue({ totalCostUsd: 0.03 } as never);
  vi.mocked(superviseConversation).mockResolvedValue({ costUsd: 0.02, tokensUsed: 100 } as never);
  vi.mocked(rubricScoreConversation).mockResolvedValue({ totalCostUsd: 0.01 } as never);
});

describe('executeEvalSweep', () => {
  it('runs supervise + rubric by default (metric scoring off) over each conversation', async () => {
    const result = await executeEvalSweep(step(), ctx());
    expect(superviseConversation).toHaveBeenCalledTimes(2);
    expect(rubricScoreConversation).toHaveBeenCalledTimes(2);
    expect(scoreConversation).not.toHaveBeenCalled();
    expect(result.output).toMatchObject({
      candidateConversations: 2,
      sweptConversations: 2,
      failedConversations: 0,
      passes: { score: false, supervise: true, rubric: true },
    });
    // cost = 2 * (0.02 supervise + 0.01 rubric); tokens = 2 * 100 supervise.
    expect(result.costUsd).toBeCloseTo(0.06, 6);
    expect(result.tokensUsed).toBe(200);
  });

  it('runs the metric scorer when score:true', async () => {
    await executeEvalSweep(step({ score: true, supervise: false, rubric: false }), ctx());
    expect(scoreConversation).toHaveBeenCalledTimes(2);
    expect(superviseConversation).not.toHaveBeenCalled();
    expect(rubricScoreConversation).not.toHaveBeenCalled();
  });

  it('threads the eval actor and passes the conversation id to each pass', async () => {
    await executeEvalSweep(step(), ctx({ userId: 'admin-9' }));
    expect(superviseConversation).toHaveBeenCalledWith({
      conversationId: 'c1',
      actorUserId: 'admin-9',
    });
  });

  it('isolates a per-conversation failure — counts it, does not abort the sweep', async () => {
    vi.mocked(superviseConversation).mockRejectedValueOnce(new Error('no scorable turns'));
    const result = await executeEvalSweep(step(), ctx());
    expect(result.output).toMatchObject({ sweptConversations: 1, failedConversations: 1 });
    // The second conversation still ran.
    expect(rubricScoreConversation).toHaveBeenCalledTimes(1); // c1 threw before rubric; c2 succeeded
  });

  it('stops early when the running cost reaches budgetLimitUsd', async () => {
    // First conversation costs 0.03; budget 0.02 → stop after the first.
    const result = await executeEvalSweep(step(), ctx({ budgetLimitUsd: 0.02 }));
    expect(result.output).toMatchObject({ sweptConversations: 1, budgetStopped: true });
    expect(superviseConversation).toHaveBeenCalledTimes(1);
  });

  it('falls back to the service account when the execution has no user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'svc-1' } as never);
    await executeEvalSweep(step(), ctx({ userId: null }));
    expect(prisma.user.findFirst).toHaveBeenCalled();
    expect(superviseConversation).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'svc-1' })
    );
  });

  it('throws ExecutorError when no service account exists and there is no user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(executeEvalSweep(step(), ctx({ userId: null }))).rejects.toBeInstanceOf(
      ExecutorError
    );
  });

  it('rejects a config that enables no pass', async () => {
    await expect(
      executeEvalSweep(step({ supervise: false, rubric: false }), ctx())
    ).rejects.toBeInstanceOf(ExecutorError);
  });

  it('rejects a malformed config', async () => {
    await expect(executeEvalSweep(step({ maxConversations: -5 }), ctx())).rejects.toBeInstanceOf(
      ExecutorError
    );
  });
});

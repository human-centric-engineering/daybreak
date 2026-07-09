/**
 * Framework-rubric scoring (f-governance-plus t-3, spec §5.5 F14) — the per-turn face of the seeded
 * `eval-judge-framework-rubric` judge. f-eval shipped the three named metrics
 * (faithfulness/groundedness/relevance) + the whole-conversation supervisor; this complements them
 * with a single framework-specific rubric score per turn (did the assistant serve the
 * facilitation/module purpose?), persisted to `FrameworkConversationEval.rubricScore`.
 *
 * Parallels `score-conversation.ts`: same framework-surface gate + turn reader, idempotent upsert per
 * `messageId`, a failed judge (`score: null`) skips the turn rather than aborting. The rubric
 * REASONING is merged into the existing `judgeReasoning` Json under a `rubric` key (read-merge-write,
 * so it never clobbers the metric scorer's reasoning), and the judge's cost is added to `costUsd`.
 */

import type { FrameworkConversationEval, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { logger } from '@/lib/logging';
import { driveJudgeAgent } from '@/lib/orchestration/evaluations/judge-driver';
import { loadFrameworkConversation } from '@/lib/framework/facilitation/evaluation/conversation';
import { listScorableTurns } from '@/lib/framework/facilitation/evaluation/turns';

const ENTITY_TYPE = 'framework_conversation_eval';

/** The seeded framework-rubric judge (see `prisma/seeds/framework/001-framework-rubric-judge.ts`). */
export const FRAMEWORK_RUBRIC_JUDGE_SLUG = 'eval-judge-framework-rubric';

export interface RubricScoreConversationArgs {
  conversationId: string;
  /** The actor the judge call attributes to (ownership-scoped reads + cost); also the audit actor. */
  actorUserId: string;
  clientIp?: string | null;
}

export interface RubricScoreConversationResult {
  conversationId: string;
  scoredTurns: number;
  skippedTurns: number;
  totalCostUsd: number;
  results: FrameworkConversationEval[];
}

/** Map the judge's citation shape from the turn's citations (marker/documentName/excerpt). */
function judgeCitations(
  citations: { marker?: number; documentName?: string | null; excerpt?: string }[]
): { marker: number; documentName: string | null; excerpt: string }[] {
  return citations.map((c, i) => ({
    marker: c.marker ?? i + 1,
    documentName: c.documentName ?? null,
    excerpt: c.excerpt ?? '',
  }));
}

/**
 * Score every turn of a framework conversation with the framework-rubric judge and persist each
 * result to `rubricScore` (upsert per turn). Throws `NotFoundError` (unknown conversation) or
 * `ValidationError` (not a framework surface).
 */
export async function rubricScoreConversation(
  args: RubricScoreConversationArgs
): Promise<RubricScoreConversationResult> {
  const { conversationId, actorUserId, clientIp } = args;

  const conversation = await loadFrameworkConversation(conversationId);
  const turns = await listScorableTurns(conversationId);

  const results: FrameworkConversationEval[] = [];
  let skippedTurns = 0;
  let totalCostUsd = 0;

  for (const turn of turns) {
    const judged = await driveJudgeAgent({
      agentSlug: FRAMEWORK_RUBRIC_JUDGE_SLUG,
      userId: actorUserId,
      question: turn.userQuestion,
      answer: turn.aiResponse,
      citations: judgeCitations(turn.citations),
    });
    totalCostUsd += judged.costUsd;

    if (judged.score === null) {
      // The judge failed (provider down / malformed response) — skip this turn, don't abort.
      logger.warn('Skipping a turn whose rubric scoring failed', {
        conversationId,
        messageId: turn.messageId,
        errorCode: judged.errorCode,
      });
      skippedTurns += 1;
      continue;
    }

    // Merge the rubric reasoning into any existing judgeReasoning (never clobber the metric scorer's).
    const existing = await prisma.frameworkConversationEval.findUnique({
      where: { messageId: turn.messageId },
      select: { judgeReasoning: true },
    });
    const existingReasoning =
      existing?.judgeReasoning && typeof existing.judgeReasoning === 'object'
        ? (existing.judgeReasoning as Record<string, unknown>)
        : {};
    const judgeReasoning: Prisma.InputJsonValue = {
      ...existingReasoning,
      rubric: { reasoning: judged.reasoning, steps: judged.evaluationSteps ?? null },
    };

    const row = await prisma.frameworkConversationEval.upsert({
      where: { messageId: turn.messageId },
      create: {
        messageId: turn.messageId,
        conversationId,
        contextType: conversation.contextType,
        contextId: conversation.contextId,
        rubricScore: judged.score,
        judgeReasoning,
        costUsd: judged.costUsd,
        scoredAt: new Date(),
      },
      update: {
        rubricScore: judged.score,
        judgeReasoning,
        costUsd: { increment: judged.costUsd },
      },
    });
    results.push(row);
  }

  logAdminAction({
    userId: actorUserId,
    action: 'framework_conversation_eval.rubric',
    entityType: ENTITY_TYPE,
    entityId: conversationId,
    entityName: conversation.contextId ?? conversation.contextType,
    metadata: {
      conversationId,
      contextType: conversation.contextType,
      scoredTurns: results.length,
      skippedTurns,
      totalCostUsd,
    },
    clientIp: clientIp ?? null,
  });

  return { conversationId, scoredTurns: results.length, skippedTurns, totalCostUsd, results };
}

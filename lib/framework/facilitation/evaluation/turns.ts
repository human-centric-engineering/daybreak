/**
 * Framework conversation turn reader (f-eval t-1) — pairs each ASSISTANT turn of a framework
 * conversation with its preceding USER turn + citations, the shape the scorer (`scoreResponse`)
 * consumes. Framework (`facilitation`/`module`) conversations do not emit `AiEvaluationLog` rows, so
 * this reads `AiMessage` directly — the same pairing + `provenance.citations` extraction the shipped
 * `evaluations/datasets/capture.ts` uses (pair on `createdAt`, since `AiMessage` has no position),
 * done once over the whole conversation.
 */

import type { Citation } from '@/types/orchestration';
import { prisma } from '@/lib/db/client';

/** One scorable Q/A turn: the assistant message + the user question that prompted it + citations. */
export interface ScorableTurn {
  /** The assistant `AiMessage` id — the eval row is keyed on this. */
  messageId: string;
  userQuestion: string;
  aiResponse: string;
  citations: Citation[];
}

/**
 * List the scorable turns of a conversation, oldest first. Each `assistant` message is paired with
 * the most recent preceding `user` message (across any `tool`/`system` turns); an assistant with no
 * preceding user is skipped. Citations come from the assistant message's `provenance.citations`.
 */
export async function listScorableTurns(conversationId: string): Promise<ScorableTurn[]> {
  const messages = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, provenance: true },
  });

  const turns: ScorableTurn[] = [];
  let lastUserQuestion: string | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      lastUserQuestion = message.content;
      continue;
    }
    if (message.role !== 'assistant') continue; // tool/system turns don't affect pairing
    if (lastUserQuestion === null) continue; // assistant with no preceding user — nothing to score

    const provenance = (message.provenance ?? {}) as { citations?: unknown };
    const citations = (
      Array.isArray(provenance.citations) ? provenance.citations : []
    ) as Citation[];

    turns.push({
      messageId: message.id,
      userQuestion: lastUserQuestion,
      aiResponse: message.content,
      citations,
    });
    lastUserQuestion = null; // consumed — the next assistant needs a fresh user turn
  }

  return turns;
}

/**
 * Framework conversation-eval read queries (f-eval t-1) — the read side of
 * `framework_conversation_eval`, split from the scorer (`./score-conversation`) the way the
 * facilitation policies split their queries from the service.
 */

import type { FrameworkConversationEval } from '@prisma/client';
import { prisma } from '@/lib/db/client';

/** The eval rows for one conversation (one per scored assistant turn), most-recently-scored first. */
export async function listConversationEvals(
  conversationId: string
): Promise<FrameworkConversationEval[]> {
  return prisma.frameworkConversationEval.findMany({
    where: { conversationId },
    orderBy: { scoredAt: 'desc' },
  });
}

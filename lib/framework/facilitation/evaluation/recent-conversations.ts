/**
 * Recent un-scored framework conversations (f-governance-plus t-3) — the watermark query the
 * scheduled eval sweep uses to avoid re-scoring. f-eval's scorers are on-demand + per-conversation;
 * a sweep needs to find which framework (`facilitation`/`module`) conversations have a turn that has
 * never been evaluated, newest first, bounded.
 *
 * `FrameworkConversationEval.messageId` is a plain scalar FK (no Prisma `@relation`, X6), so this can
 * NOT be a single relational `none`/`some` query. Instead: take a recent WINDOW of framework
 * conversations, read their assistant turns, subtract the turns that already have an eval row, and
 * return the conversations that still have an un-scored turn — capped at `maxConversations`. Bounded
 * (window-capped) and read-only; three queries, fine for a background sweep.
 *
 * The watermark is deliberately "has a turn LACKING an eval row" (never-scored), per the plan: a
 * conversation is swept once, when first eligible, running all the sweep's enabled passes together.
 * Re-enabling a pass later does not retro-score already-scored conversations through the sweep — the
 * on-demand scorers remain the backfill path (mirrors f-eval's on-demand model).
 */

import { prisma } from '@/lib/db/client';
import { FRAMEWORK_CONTEXT_TYPES } from '@/lib/framework/facilitation/evaluation/conversation';

/** A framework conversation the sweep should evaluate. */
export interface UnscoredFrameworkConversation {
  id: string;
  contextType: string;
  contextId: string | null;
}

/** Floor/cap on the recent-conversation scan window (independent of the per-run selection cap). */
const SCAN_WINDOW_FLOOR = 100;
const SCAN_WINDOW_CAP = 500;

/** The recent-conversation window to examine for a given selection cap. */
function scanWindow(maxConversations: number): number {
  return Math.min(Math.max(maxConversations * 4, SCAN_WINDOW_FLOOR), SCAN_WINDOW_CAP);
}

/**
 * Up to `maxConversations` recent framework conversations that have at least one assistant turn with
 * no eval row, newest first. Returns `[]` when none are pending.
 */
export async function listRecentUnscoredFrameworkConversations(
  maxConversations: number
): Promise<UnscoredFrameworkConversation[]> {
  // 1. A recent window of framework conversations (bounded scan).
  const window = await prisma.aiConversation.findMany({
    where: { contextType: { in: [...FRAMEWORK_CONTEXT_TYPES] } },
    orderBy: { updatedAt: 'desc' },
    take: scanWindow(maxConversations),
    select: { id: true, contextType: true, contextId: true },
  });
  if (window.length === 0) return [];

  // 2. Their assistant turns (the eval-keyed messages).
  const conversationIds = window.map((c) => c.id);
  const assistantMessages = await prisma.aiMessage.findMany({
    where: { conversationId: { in: conversationIds }, role: 'assistant' },
    select: { id: true, conversationId: true },
  });
  if (assistantMessages.length === 0) return [];

  // 3. Which of those already have an eval row.
  const scored = await prisma.frameworkConversationEval.findMany({
    where: { messageId: { in: assistantMessages.map((m) => m.id) } },
    select: { messageId: true },
  });
  const scoredMessageIds = new Set(scored.map((s) => s.messageId));

  // A conversation is pending if any of its assistant turns lacks an eval row.
  const pendingConversationIds = new Set<string>();
  for (const message of assistantMessages) {
    if (!scoredMessageIds.has(message.id)) pendingConversationIds.add(message.conversationId);
  }

  // Preserve the window's recency order; cap at maxConversations. `contextType` is non-null here (the
  // `in` filter excludes nulls), so the narrow is safe.
  const result: UnscoredFrameworkConversation[] = [];
  for (const conversation of window) {
    if (conversation.contextType !== null && pendingConversationIds.has(conversation.id)) {
      result.push({
        id: conversation.id,
        contextType: conversation.contextType,
        contextId: conversation.contextId,
      });
      if (result.length >= maxConversations) break;
    }
  }
  return result;
}

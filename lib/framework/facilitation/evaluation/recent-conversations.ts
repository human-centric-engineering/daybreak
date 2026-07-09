/**
 * Recent un-scored framework conversations (f-governance-plus t-3) — the watermark query the
 * scheduled eval sweep uses to avoid re-scoring. f-eval's scorers are on-demand + per-conversation;
 * a sweep needs to find which framework (`facilitation`/`module`) conversations have a turn that has
 * never been evaluated, newest first, bounded.
 *
 * `FrameworkConversationEval.messageId` is a plain scalar FK (no Prisma `@relation`, X6), so this can
 * NOT be a single relational `none`/`some` query. Instead: take a recent WINDOW of framework
 * conversations, read their assistant turns, and return the ones with NO eval row at all — capped at
 * `maxConversations`. Bounded (window-capped) and read-only; three queries, fine for a background sweep.
 *
 * The watermark is deliberately CONVERSATION-LEVEL "has assistant turns but no eval row at all"
 * (never scored), NOT per-turn "has a turn lacking a row". The per-turn form over-selects: the passes
 * do not write a row for every assistant message — supervise writes only ONE anchor row per
 * conversation, and unpaired assistant turns (a greeting with no preceding user) never get scored at
 * all — so a per-turn watermark would re-select and re-score (re-pay) those conversations on every
 * tick and never clear. Conversation-level means each conversation is swept ONCE, when first
 * eligible, running all the sweep's enabled passes together; the on-demand scorers remain the
 * backfill path for a re-enabled pass (mirrors f-eval's on-demand model). A conversation with only
 * unpaired turns still gets re-selected, but its passes are cheap no-ops (no scorable turn → no judge
 * call), so no cost churns.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
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
 * Up to `maxConversations` recent framework conversations that have assistant turns but NO eval row
 * at all (never scored), newest first. Returns `[]` when none are pending.
 */
export async function listRecentUnscoredFrameworkConversations(
  maxConversations: number
): Promise<UnscoredFrameworkConversation[]> {
  // 1. A recent window of framework conversations (bounded scan).
  const capacity = scanWindow(maxConversations);
  const window = await prisma.aiConversation.findMany({
    where: { contextType: { in: [...FRAMEWORK_CONTEXT_TYPES] } },
    orderBy: { updatedAt: 'desc' },
    take: capacity,
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

  // Conversation-level watermark: a conversation is a candidate iff it has assistant turns AND NONE of
  // them has an eval row (never scored). Tracking "has an assistant turn" avoids selecting a
  // conversation with no assistant messages (nothing to score); tracking "has a scored turn" excludes
  // any already-swept conversation regardless of unpaired/anchor-only rows (see the module header).
  const conversationsWithAssistant = new Set<string>();
  const conversationsWithAScore = new Set<string>();
  for (const message of assistantMessages) {
    conversationsWithAssistant.add(message.conversationId);
    if (scoredMessageIds.has(message.id)) conversationsWithAScore.add(message.conversationId);
  }

  // Preserve the window's recency order; cap at maxConversations. `contextType` is non-null here (the
  // `in` filter excludes nulls), so the narrow is safe.
  const result: UnscoredFrameworkConversation[] = [];
  for (const conversation of window) {
    if (
      conversation.contextType !== null &&
      conversationsWithAssistant.has(conversation.id) &&
      !conversationsWithAScore.has(conversation.id)
    ) {
      result.push({
        id: conversation.id,
        contextType: conversation.contextType,
        contextId: conversation.contextId,
      });
      if (result.length >= maxConversations) break;
    }
  }

  // The scan window is bounded, so un-scored conversations OLDER than the newest `capacity` are never
  // examined. Warn when the window saturates AND the run didn't fill its selection from it, so an
  // operator has a signal that coverage may be lagging behind conversation volume (raise the cron
  // frequency, or run the on-demand scorers to backfill).
  if (window.length === capacity && result.length < maxConversations) {
    logger.warn('framework eval sweep: conversation scan window saturated', {
      scanWindow: capacity,
      selected: result.length,
    });
  }

  return result;
}

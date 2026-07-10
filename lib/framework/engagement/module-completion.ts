/**
 * Module-completion detection (f-engagement-analytics t-3, spec §4.3, A9) — the derived
 * `module.completed` emit.
 *
 * A module is "completed" when the user has a `node_completed` for **every** `module`-type
 * map node bound to the slug (decision C — all-nodes-complete, derived; the map schema has
 * no per-node terminal flag, so a designated terminal node is a deferred refinement). This
 * is checked **after** a committed `complete` transition, from the transition caller
 * (`applyJourneyTransition`) — **never inside `applyEvent`**, so the pure engine stays
 * LLM-free and binding-free (F11).
 *
 * DERIVED from the insert-only stream (A9 — no counter): completion is read from the user's
 * `node_completed` events, not the live `UserNodeState` projection, because a `repeatable`
 * node reopens after completing (its projection goes back to available) but its completion
 * history stands. Idempotent by a prior-event guard — one `module.completed` per (user,
 * module). The residual race (two of the module's last nodes completing near-simultaneously
 * could each pass the guard and both emit) is accepted: this is best-effort instrumentation,
 * and the double-emit is bounded and harmless (stats read distinct users / first-completion).
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { ENGAGEMENT_EVENT_TYPE } from '@/lib/framework/engagement/vocabulary';
import { recordModuleEngagement } from '@/lib/framework/engagement/record-engagement';
import { JOURNEY_EVENT_TYPE } from '@/lib/framework/facilitation/journey/vocabulary';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';

/** Inputs to {@link maybeEmitModuleCompleted}: the just-completed module + the read context. */
export interface ModuleCompletionCheck {
  /** The journey owner (the `JourneyEvent.userId` erasure key). */
  userId: string;
  /** The module the just-completed node belongs to. */
  moduleSlug: string;
  /** The journey the completion happened on (`UserJourney.id`). */
  journeyId: string;
  /** The published map's topology — the module's `module`-type nodes are read from here. */
  graph: GraphStore;
}

/**
 * If the just-completed node finished the whole module (every `module`-type node for the
 * slug now `node_completed` for this user) and no `module.completed` was recorded before,
 * emit `module.completed` (which also fires the module's `module.completed` workflow
 * bindings). Best-effort and non-throwing — safe to call fire-and-forget from the
 * transition caller; a failure is logged and swallowed so it never breaks the transition.
 */
export async function maybeEmitModuleCompleted(input: ModuleCompletionCheck): Promise<void> {
  const { userId, moduleSlug, journeyId, graph } = input;

  try {
    // The module's map nodes. A module may back several `module`-type nodes; completion
    // means all of them are done. Empty ⇒ nothing to complete (the completed node's slug
    // is not a module node — shouldn't happen, but a clean no-op if so).
    const moduleNodeKeys = graph
      .nodes()
      .filter((n) => n.type === 'module' && n.moduleSlug === moduleSlug)
      .map((n) => n.key);
    if (moduleNodeKeys.length === 0) return;

    // Idempotency guard: one `module.completed` per (user, module). A prior one ⇒ done.
    const prior = await prisma.journeyEvent.findFirst({
      where: { userId, moduleSlug, type: ENGAGEMENT_EVENT_TYPE.moduleCompleted },
      select: { id: true },
    });
    if (prior !== null) return;

    // Which of the module's nodes the user has completed at least once (events, not the
    // live projection — a repeatable node reopens but its `node_completed` history stands).
    const completedRows = await prisma.journeyEvent.findMany({
      where: {
        journeyId,
        userId,
        type: JOURNEY_EVENT_TYPE.nodeCompleted,
        nodeKey: { in: moduleNodeKeys },
      },
      select: { nodeKey: true },
      distinct: ['nodeKey'],
    });
    const completed = new Set(completedRows.map((r) => r.nodeKey));
    if (!moduleNodeKeys.every((key) => completed.has(key))) return;

    // Newly all-complete: record it (durable event + fire `module.completed` bindings).
    await recordModuleEngagement({
      userId,
      moduleSlug,
      type: ENGAGEMENT_EVENT_TYPE.moduleCompleted,
      journeyId,
    });
  } catch (err) {
    logger.error(
      'maybeEmitModuleCompleted: completion check failed',
      err instanceof Error ? err : new Error(String(err)),
      { userId, moduleSlug, journeyId }
    );
  }
}

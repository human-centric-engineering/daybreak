/**
 * Guidance service (f-guidance t-1, spec §5.4) — the orchestration face the capability family
 * (t-2/t-3) consumes. It composes the impure assembler (`assemble.ts`) with the pure engine
 * (`computeAvailability`) and the pure ranking/synopsis cores, so a capability is a thin wrapper
 * over one of these calls. No capabilities here yet (t-2/t-3); no LLM ever (guidance is
 * deterministic — agents narrate its outputs).
 *
 * Every entry point returns `null` for "nothing to guide" (no published map / journey not
 * started) and propagates `ForbiddenError` from the `canRead`-guarded reads — the capability
 * turns those into a structured result.
 */

import type { JourneyViewer, AccessScope } from '@/lib/framework/shared/access';
import type { JourneyKey } from '@/lib/framework/facilitation/journey/queries';
import {
  computeAvailability,
  type AvailabilityResult,
} from '@/lib/framework/facilitation/engine/availability';
import { getJourneyTimeline } from '@/lib/framework/facilitation/journey/queries';
import { assembleJourneyContext, type JourneyContext } from '@/lib/framework/guidance/assemble';
import {
  rankMoves,
  suggestFocus,
  type RankedMove,
  type FocusSuggestion,
} from '@/lib/framework/guidance/ranking';
import {
  buildProgressSynopsis,
  type ProgressSynopsis,
  type BuildSynopsisOptions,
} from '@/lib/framework/guidance/synopsis';

/** The full guidance picture for one journey: engine eligibility + ranked advice. */
export interface Guidance {
  context: JourneyContext;
  availability: AvailabilityResult;
  /** The engine's `validMoves`, ranked wisest-first with reasons (F12). */
  moves: readonly RankedMove[];
}

/**
 * Load the full guidance picture: assemble the inputs, compute availability (the engine's
 * "what is possible"), and rank the eligible moves ("what is wise"). `null` when there is
 * nothing to guide.
 */
export async function loadGuidance(
  viewer: JourneyViewer,
  key: JourneyKey,
  scope?: AccessScope
): Promise<Guidance | null> {
  const context = await assembleJourneyContext(viewer, key, scope);
  if (context === null) return null;

  const availability = computeAvailability(context.availabilityInput);
  const moves = rankMoves({
    graph: context.availabilityInput.graph,
    availability,
    slotHeads: context.slotHeads,
    now: context.now.instant,
  });
  return { context, availability, moves };
}

/** The linger-vs-move recommendation over the ranked moves, or `null` when nothing to guide. */
export async function loadFocusSuggestion(
  viewer: JourneyViewer,
  key: JourneyKey,
  scope?: AccessScope
): Promise<FocusSuggestion | null> {
  const guidance = await loadGuidance(viewer, key, scope);
  if (guidance === null) return null;
  return suggestFocus(guidance.moves);
}

/**
 * The deterministic progress digest for one journey (node-state projection + timeline), or
 * `null` when the journey has not started. Assembles the journey context (for the node states)
 * and reads the `canRead`-guarded timeline.
 */
export async function loadProgressSynopsis(
  viewer: JourneyViewer,
  key: JourneyKey,
  scope?: AccessScope,
  options?: BuildSynopsisOptions
): Promise<ProgressSynopsis | null> {
  const context = await assembleJourneyContext(viewer, key, scope);
  if (context === null) return null;

  const timeline = await getJourneyTimeline(
    viewer,
    { journeyId: context.journey.id, subject: key.userId },
    { order: 'desc' },
    scope
  );
  return buildProgressSynopsis(context.nodeStates, timeline, options);
}

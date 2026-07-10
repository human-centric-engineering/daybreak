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
import {
  applyEvent,
  type ApplyEventResult,
  type TransitionKind,
} from '@/lib/framework/facilitation/engine/apply-event';
import { getJourneyTimeline } from '@/lib/framework/facilitation/journey/queries';
import { getPublishedMapVersion } from '@/lib/framework/facilitation/map/version-service';
import { enrichMovesWithRelated } from '@/lib/framework/facilitation/overlays/related';
import { maybeEmitModuleCompleted } from '@/lib/framework/engagement/module-completion';
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
  const ranked = rankMoves({
    graph: context.availabilityInput.graph,
    availability,
    slotHeads: context.slotHeads,
    now: context.now.instant,
  });

  // Advisory "related places" overlay (f-overlays, F9): fill each move's `related` slot from node
  // similarity, STRICTLY downstream of the (already-computed) availability — it decorates moves and
  // never feeds eligibility. Keyed on the current published version; empty when nothing is embedded.
  // (The version is re-read here rather than threaded from `assemble`; a republish+re-embed landing
  // between the two reads could key `related` to the newer version — harmless, since `related` is
  // advisory and a nodeKey absent from the narrated graph is simply not surfaced.)
  const version = await getPublishedMapVersion(key.graphSlug);
  const moves =
    version === null ? ranked : await enrichMovesWithRelated(key.graphSlug, version, ranked);

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

/** The transition a caller asks the engine to make. */
export interface TransitionRequest {
  nodeKey: string;
  kind: TransitionKind;
}

/**
 * Ask the engine to apply a journey transition (the sole write path). Assembles the same
 * read context and hands it to `applyEvent`, which validates the move and — on success —
 * writes the event + projection in one transaction, or returns a `Rejection` (with the
 * node's lock reasons) that never touches the DB. `null` when the journey has not started
 * (nothing to transition). The subject is `key.userId`, `canRead`-guarded by the assembler.
 */
export async function applyJourneyTransition(
  viewer: JourneyViewer,
  key: JourneyKey,
  move: TransitionRequest,
  scope?: AccessScope
): Promise<ApplyEventResult | null> {
  const context = await assembleJourneyContext(viewer, key, scope);
  if (context === null) return null;

  const result = await applyEvent({
    ...context.availabilityInput,
    transition: {
      userId: key.userId,
      journeyId: context.journey.id,
      nodeKey: move.nodeKey,
      kind: move.kind,
    },
  });

  // module.completed detection (f-engagement-analytics t-3, spec §4.3): after a *committed*
  // `complete` on a node that belongs to a module, check whether that finished the whole
  // module for this user and, if so, emit `module.completed`. Fire-and-forget and
  // non-throwing — the pure engine (`applyEvent`) stays untouched (F11); the derived,
  // whole-module fact is computed here in the transition caller, after the write commits.
  if (result.ok && move.kind === 'complete') {
    const node = context.availabilityInput.graph.node(move.nodeKey);
    if (node?.moduleSlug !== undefined) {
      void maybeEmitModuleCompleted({
        userId: key.userId,
        moduleSlug: node.moduleSlug,
        journeyId: context.journey.id,
        graph: context.availabilityInput.graph,
      });
    }
  }

  return result;
}

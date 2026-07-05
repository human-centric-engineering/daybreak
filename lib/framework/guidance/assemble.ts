/**
 * Availability-input assembler (f-guidance t-1, decision 1) — the impure seam the pure engine
 * deliberately left open. `computeAvailability` / `applyEvent` take a fully-resolved
 * `AvailabilityInput`; `apply-event.ts`'s header names f-guidance as the owner of "the
 * assembler that loads the graph + state + slots + liveness + `canRead`-guards the reads."
 * This is that assembler — and the reused seam `f-facilitation-agents` (13) inherits, so it is
 * built as its final generic shape.
 *
 * Access (X2): the journey/state reads route through the `canRead`-guarded journey queries
 * (`getJourney` throws `ForbiddenError` if denied — before any read), so by the time slots are
 * read the viewer is already established as permitted for this subject. Slots are the subject's
 * own heads (`getSlotHeads(subject)`), covered by that same decision.
 */

import type { AvailabilityInput } from '@/lib/framework/facilitation/engine/availability';
import type { JourneyViewer, AccessScope } from '@/lib/framework/shared/access';
import type { JourneyKey } from '@/lib/framework/facilitation/journey/queries';
import type { UserJourney, UserNodeState, SlotValue } from '@prisma/client';
import { getPublishedGraph } from '@/lib/framework/facilitation/engine/published-graph';
import { resolveJourneyNow, type ResolvedNow } from '@/lib/framework/facilitation/engine/now';
import { getJourney, getNodeStates } from '@/lib/framework/facilitation/journey/queries';
import { getSlotHeads } from '@/lib/framework/data-slots/values';
import { listModules } from '@/lib/framework/modules/queries';
import { isModuleLive, type ModuleLiveness } from '@/lib/framework/modules/liveness';
import { getAllFlags } from '@/lib/feature-flags';

/** Everything a guidance call needs about one journey — the engine input plus the raw
 *  reads the ranking/synopsis layers consume (slot heads carry `capturedAt`, which the
 *  trimmed `SlotReadingView` the engine sees does not). */
export interface JourneyContext {
  journey: UserJourney;
  nodeStates: readonly UserNodeState[];
  slotHeads: readonly SlotValue[];
  now: ResolvedNow;
  /** Ready to hand to `computeAvailability` / `applyEvent`. */
  availabilityInput: AvailabilityInput;
}

/**
 * Assemble the journey context for `key`, or `null` when there is nothing to guide — no
 * published map for the slug, or the user has not started the journey (no `UserJourney` row).
 * Throws `ForbiddenError` (from the journey queries) if the viewer may not read the subject.
 */
export async function assembleJourneyContext(
  viewer: JourneyViewer,
  key: JourneyKey,
  scope?: AccessScope
): Promise<JourneyContext | null> {
  const graph = await getPublishedGraph(key.graphSlug);
  if (graph === null) return null; // no published map to reason over

  const journey = await getJourney(viewer, key, scope); // canRead-guarded
  if (journey === null) return null; // journey not started

  const scopedKey = { journeyId: journey.id, subject: key.userId };
  const [nodeStates, slotHeads, now, modules, flagRows] = await Promise.all([
    getNodeStates(viewer, scopedKey, scope), // canRead-guarded
    getSlotHeads(key.userId), // subject's own heads (canRead already cleared this subject)
    resolveJourneyNow(key.userId),
    listModules(),
    getAllFlags(),
  ]);

  const flags = Object.fromEntries(flagRows.map((f) => [f.name, f.enabled]));
  const moduleLiveness = new Map<string, ModuleLiveness>(
    modules.map((m) => [m.slug, isModuleLive(m, flags, now.instant)])
  );

  return {
    journey,
    nodeStates,
    slotHeads,
    now,
    availabilityInput: {
      graph,
      nodeStates,
      slots: slotHeads,
      moduleLiveness,
      now: now.instant,
    },
  };
}

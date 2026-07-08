/**
 * Journey dry-run adapter (f-map-editor t-5, spec Appendix A — F18).
 *
 * The engine was built pure precisely so an author can simulate a synthetic user
 * against a *draft* map before publishing (see `engine/availability.ts`'s header).
 * This module is the thin synthetic-input adapter: it turns a plain
 * `{ completions, slots, now }` request into the in-memory `AvailabilityInput` the
 * pure `computeAvailability` + `rankMoves` expect, runs them over an
 * `inMemoryGraphStore(definition)` (NOT the published graph), and returns the
 * per-node verdicts (available + every `lockReason`) plus the ranked moves.
 *
 * **Zero DB, zero writes.** It never calls `applyEvent` (the journey-state writer),
 * `getPublishedGraph` (the DB loader), or `loadGuidance` (the DB-bound orchestrator) —
 * everything is derived from the caller-supplied definition + synthetic inputs. Module
 * liveness is treated as "all live" (an empty map ⇒ each module absent ⇒ live), because
 * liveness needs DB I/O and a structural dry-run is about the *gating* logic, not live
 * module status.
 */

import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import { inMemoryGraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import {
  computeAvailability,
  type LockReason,
} from '@/lib/framework/facilitation/engine/availability';
import { rankMoves, type RankedMove } from '@/lib/framework/guidance/ranking';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

/** A synthetic slot reading. `confidence` (1–10) defaults to fully-confident so a value
 *  satisfies confidence gates unless the author deliberately lowers it; `capturedAt`
 *  defaults to `now` (only the ranker's recency signals read it). */
export interface DryRunSlotInput {
  slug: string;
  value: number | string | boolean;
  confidence?: number;
  capturedAt?: Date;
}

export interface DryRunInput {
  /** Node keys the synthetic user has completed (each ⇒ a `completed` node state). */
  completions: readonly string[];
  slots: readonly DryRunSlotInput[];
  /** The synthetic clock — drives temporal gates and the ranker's deadlines/recency. */
  now: Date;
}

/** One node's dry-run verdict (`lockReasons` empty iff available). */
export interface DryRunNodeResult {
  nodeKey: string;
  available: boolean;
  lockReasons: readonly LockReason[];
}

export interface DryRunResult {
  /** Every node in the map, with its availability verdict + why-locked. */
  nodes: DryRunNodeResult[];
  /** The available set (the legal next steps). */
  validMoves: readonly string[];
  /** Available first-arrival nodes the synthetic user has never reached. */
  firsts: readonly string[];
  /** The available moves, guidance-ranked (freshest/most-useful first) with reasons. */
  ranked: RankedMove[];
}

/** A slot value held at full confidence unless the author says otherwise. */
const DEFAULT_CONFIDENCE = 10;

/**
 * Run the pure availability + ranking engines over a draft definition and synthetic
 * inputs. Pure and DB-free — the request handler is the only caller.
 */
export function runDryRun(definition: MapDefinition, input: DryRunInput): DryRunResult {
  const { completions, slots, now } = input;
  const graph = inMemoryGraphStore(definition);

  // A completed node has been entered (so it is "reached") and finished. Non-completed
  // nodes simply carry no state — the engine reads that as unvisited.
  const nodeStates = completions.map((nodeKey) => ({
    nodeKey,
    status: NODE_STATE_STATUS.completed,
    firstEnteredAt: now,
    lastActiveAt: now,
  }));

  const slotReadings = slots.map((s) => ({
    slotSlug: s.slug,
    valueJson: s.value,
    confidence: s.confidence ?? DEFAULT_CONFIDENCE,
  }));

  const slotHeads = slots.map((s) => ({
    slotSlug: s.slug,
    confidence: s.confidence ?? DEFAULT_CONFIDENCE,
    capturedAt: s.capturedAt ?? now,
  }));

  const availability = computeAvailability({
    graph,
    nodeStates,
    slots: slotReadings,
    // Dry-run: modules are treated as live (empty map ⇒ absent ⇒ live), no DB lookup.
    moduleLiveness: new Map(),
    now,
  });

  const ranked = rankMoves({ graph, availability, slotHeads, now });

  const nodes: DryRunNodeResult[] = [...availability.perNode.entries()].map(
    ([nodeKey, verdict]) => ({
      nodeKey,
      available: verdict.available,
      lockReasons: verdict.lockReasons,
    })
  );

  return {
    nodes,
    validMoves: availability.validMoves,
    firsts: availability.firsts,
    ranked,
  };
}

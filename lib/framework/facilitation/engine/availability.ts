/**
 * Availability computation (f-engine t-2) — `computeAvailability`, the pure,
 * explainable "what is possible now" over the map + journey state (spec §5.3).
 *
 * Evaluates the four typed-edge semantics (F3) and the three condition families
 * (F4, via `conditions.ts`) against node state, slot heads, and a resolved `now`,
 * intersected with module liveness (A5), and returns the complete picture: a verdict
 * per node (available, or locked **with every failing gate's reason** — F12's
 * "the engine computes what is possible; guidance ranks what is wise"), the legal
 * `validMoves`, and the first-arrival `firsts`.
 *
 * **Pure** — no DB, no clock read. `now` is an input (the `resolveJourneyNow` seam,
 * `now.ts`, produces it from `User.timezone`); slot heads are an input (the caller
 * fetches them via `getSlotHeads` behind `canRead`, decision 11); module liveness is
 * an input lookup (the caller builds it from `isModuleLive`, A5). This is what makes
 * the dry-run simulator (F18) able to set the clock and the state freely.
 *
 * Edge semantics (F3), and how they combine (documented for review — see `f-engine.md`):
 * - `prerequisite` — a hard AND gate: **every** incoming prerequisite edge must be
 *   satisfied.
 * - `unlocks` — an OR gate: if any incoming `unlocks` edges exist, **at least one**
 *   must be satisfied.
 * - `tangent` — an always-open side path: a satisfied incoming `tangent` edge opens
 *   the node **regardless** of prerequisite/unlock gates.
 * - `related_to` — advisory only; **never** consulted for eligibility.
 * - An edge `S → N` is *satisfied* when its condition holds (F4) **and** its source is
 *   `completed` (for prerequisite/unlocks) or merely reached (for the always-open
 *   tangent). A node with no eligibility edges is open (an entry node).
 * - A `once` node that is already `completed` is **closed** (F6); a `repeatable` node
 *   reopens (its cooldown, if any, is an edge condition).
 * - pgvector similarity is never an input (F9).
 */

import type { EdgeType, MapEdge, MapNode } from '@/lib/framework/facilitation/map/schema';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import type { NodeKey } from '@/lib/framework/shared/scope';
import type { ModuleLiveness, ModuleLockReason } from '@/lib/framework/modules/liveness';
import {
  evaluateCondition,
  isCompleted,
  isReached,
  type NodeStateView,
  type SlotReadingView,
  type ConditionContext,
} from '@/lib/framework/facilitation/engine/conditions';

/** A node-state row keyed by its node (a `UserNodeState` satisfies this). */
export type JourneyNodeState = NodeStateView & { nodeKey: NodeKey };

/** Inputs to {@link computeAvailability}. All resolved by the caller so the function
 *  stays pure. */
export interface AvailabilityInput {
  /** Topology over the published map (t-1). */
  graph: GraphStore;
  /** The user's node-state projection (from `getNodeStates`). */
  nodeStates: readonly JourneyNodeState[];
  /** The user's current slot heads (from `getSlotHeads`, `canRead`-guarded). */
  slots: readonly SlotReadingView[];
  /** Module liveness by module slug (built from `isModuleLive`, A5). A node whose
   *  module is absent from the lookup is treated as live (no module gate). */
  moduleLiveness: (moduleSlug: string) => ModuleLiveness | undefined;
  /** The resolved instant (from `resolveJourneyNow`). */
  now: Date;
}

/** Why a node is locked — one per failing gate, structured for narration. */
export type LockReason =
  | { kind: 'module'; moduleSlug: string; reason: ModuleLockReason }
  | { kind: 'completed' }
  | { kind: 'prerequisite'; from: NodeKey }
  | { kind: 'condition'; from: NodeKey; edgeType: EdgeType; condition: MapEdge['condition'] }
  | { kind: 'unlock'; candidates: readonly NodeKey[] };

/** The per-node verdict. `lockReasons` is empty iff `available`. */
export interface NodeVerdict {
  available: boolean;
  lockReasons: readonly LockReason[];
}

/** The complete availability picture for one journey. */
export interface AvailabilityResult {
  /** Verdict per node key (every node in the graph appears). */
  perNode: Map<NodeKey, NodeVerdict>;
  /** Node keys the user may act on now (the available set) — the legal next steps. */
  validMoves: readonly NodeKey[];
  /** Available nodes with an `onFirstArrival` hook the user has never reached — the
   *  first-arrival ("airport") triggers. */
  firsts: readonly NodeKey[];
}

/** Compute the explainable availability picture. Pure. */
export function computeAvailability(input: AvailabilityInput): AvailabilityResult {
  const { graph, now } = input;
  const stateByKey = new Map<NodeKey, JourneyNodeState>(
    input.nodeStates.map((s) => [s.nodeKey, s])
  );
  const slotBySlug = new Map<string, SlotReadingView>(input.slots.map((s) => [s.slotSlug, s]));

  const perNode = new Map<NodeKey, NodeVerdict>();
  for (const node of graph.nodes()) {
    perNode.set(
      node.key,
      verdictFor(node, graph, stateByKey, slotBySlug, input.moduleLiveness, now)
    );
  }

  const validMoves: NodeKey[] = [];
  const firsts: NodeKey[] = [];
  for (const node of graph.nodes()) {
    if (!perNode.get(node.key)?.available) continue;
    validMoves.push(node.key);
    if (node.onFirstArrival !== undefined && stateByKey.get(node.key)?.firstEnteredAt == null) {
      firsts.push(node.key);
    }
  }

  return { perNode, validMoves, firsts };
}

function verdictFor(
  node: MapNode,
  graph: GraphStore,
  stateByKey: Map<NodeKey, JourneyNodeState>,
  slotBySlug: Map<string, SlotReadingView>,
  moduleLiveness: AvailabilityInput['moduleLiveness'],
  now: Date
): NodeVerdict {
  const reasons: LockReason[] = [];
  const ctx: ConditionContext = {
    nodeState: (key) => stateByKey.get(key),
    slot: (slug) => slotBySlug.get(slug),
    now,
    target: stateByKey.get(node.key),
  };
  const satisfied = (edge: MapEdge): boolean => edgeSatisfied(edge, stateByKey, ctx);

  // 1. Module liveness (A5) — a module node's module must be live.
  if (node.type === 'module' && node.moduleSlug !== undefined) {
    const liveness = moduleLiveness(node.moduleSlug);
    if (liveness !== undefined && !liveness.live) {
      reasons.push({ kind: 'module', moduleSlug: node.moduleSlug, reason: liveness.reason });
    }
  }

  // 2. Once-close (F6) — a completed one-off node is closed.
  const state = stateByKey.get(node.key);
  const closedOnce = node.completionMode === 'once' && isCompleted(state);
  if (closedOnce) reasons.push({ kind: 'completed' });

  // 3. Structural gate over incoming eligibility edges (F3; related_to excluded).
  const incoming = graph
    .neighbours(node.key, { direction: 'in' })
    .filter((e) => e.type !== 'related_to');
  const prerequisites = incoming.filter((e) => e.type === 'prerequisite');
  const unlocks = incoming.filter((e) => e.type === 'unlocks');
  const tangents = incoming.filter((e) => e.type === 'tangent');

  let structurallyOpen: boolean;
  if (tangents.some(satisfied)) {
    structurallyOpen = true; // an always-open side path bypasses the gates.
  } else {
    const prerequisitesMet = prerequisites.every(satisfied);
    const unlockMet = unlocks.length === 0 || unlocks.some(satisfied);
    structurallyOpen = prerequisitesMet && unlockMet;
    if (!prerequisitesMet) {
      for (const edge of prerequisites) {
        if (!satisfied(edge)) reasons.push(unsatisfiedReason(edge, stateByKey));
      }
    }
    if (!unlockMet) {
      reasons.push({ kind: 'unlock', candidates: unlocks.map((e) => e.from) });
    }
  }

  const available = reasons.length === 0 && structurallyOpen;
  return { available, lockReasons: reasons };
}

/** An edge is satisfied when its source is reached appropriately and its condition
 *  (if any) holds. prerequisite/unlocks need a *completed* source; a tangent's
 *  source need only be reached (its "always open from here"). */
function edgeSatisfied(
  edge: MapEdge,
  stateByKey: Map<NodeKey, JourneyNodeState>,
  ctx: ConditionContext
): boolean {
  const source = stateByKey.get(edge.from);
  const sourceOk = edge.type === 'tangent' ? isReached(source) : isCompleted(source);
  if (!sourceOk) return false;
  return edge.condition === undefined || evaluateCondition(edge.condition, ctx);
}

/** The reason a prerequisite edge is unsatisfied: an incomplete source, else the
 *  unmet condition (the only other way `edgeSatisfied` can fail). */
function unsatisfiedReason(edge: MapEdge, stateByKey: Map<NodeKey, JourneyNodeState>): LockReason {
  if (!isCompleted(stateByKey.get(edge.from))) {
    return { kind: 'prerequisite', from: edge.from };
  }
  // Source is completed, so the condition is what failed — and it must exist, since a
  // conditionless edge with a completed source is satisfied.
  return { kind: 'condition', from: edge.from, edgeType: edge.type, condition: edge.condition };
}

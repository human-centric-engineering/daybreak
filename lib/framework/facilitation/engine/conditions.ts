/**
 * Condition evaluation (f-engine t-2) — the pure evaluator for the three
 * family-tagged gate conditions (F4) an edge may carry: `state`, `slot`, `temporal`.
 *
 * Declarative JSON, never code (F4): the engine *evaluates* the exact `MapCondition`
 * shapes `f-map` shipped (imported from `map/schema.ts`, never re-declared). Pure —
 * a function of the supplied node-state / slot / `now` views, so it is trivially
 * unit-testable with a controlled clock. Slots are read as their **typed
 * `valueJson`**, never prose (§6.1); the caller resolves the heads (via
 * `getSlotHeads`, `canRead`-guarded — decision 11) and passes them in.
 *
 * Semantic decisions (documented for review — see `f-engine.md`):
 * - **`state.reached`** means the referenced node is `completed` (a milestone/marker
 *   is "reached" once finished, F6), not merely entered.
 * - **`recommended_by`** is **advisory and never gates eligibility** — it is a soft
 *   deadline the guidance layer ranks by (F12); as an edge condition it is always
 *   satisfied, so it can't lock a node.
 * - **`cooldown_since_last_visit`** is relative to the **target** node's last visit
 *   (`lastActiveAt`): a never-visited node has no cooldown to serve, so it passes.
 */

import type { MapCondition } from '@/lib/framework/facilitation/map/schema';
import type { NodeKey } from '@/lib/framework/shared/scope';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

/** The node-state fields the evaluator + availability actually read — a
 *  `UserNodeState` row structurally satisfies this (the `ModuleLivenessFields`
 *  pattern: only the fields that drive a verdict). `status` gates completion/reached;
 *  `lastActiveAt` serves the cooldown; `firstEnteredAt` serves first-arrival. */
export interface NodeStateView {
  status: string;
  firstEnteredAt: Date | null;
  lastActiveAt: Date | null;
}

/** The current head of one slot the evaluator reads — a `SlotValue` row structurally
 *  satisfies this. `valueJson` is the typed form (§6.1); non-scalar values are not a
 *  gate value. */
export interface SlotReadingView {
  slotSlug: string;
  valueJson: unknown;
  confidence: number;
}

/** What a condition is evaluated against. */
export interface ConditionContext {
  /** The node-state projection by node key (for `state` predicates). */
  nodeState: (key: NodeKey) => NodeStateView | undefined;
  /** The current slot head by slug (for `slot` predicates). */
  slot: (slug: string) => SlotReadingView | undefined;
  /** The resolved instant (for `temporal` predicates) — pure input, no clock read. */
  now: Date;
  /** The state of the node the gated edge leads *to* — used only by
   *  `cooldown_since_last_visit`, whose "last visit" is that node's. */
  target: NodeStateView | undefined;
}

/** A node is "reached" once entered — any non-`unvisited` standing. */
const REACHED_STATUSES: ReadonlySet<string> = new Set([
  NODE_STATE_STATUS.visited,
  NODE_STATE_STATUS.active,
  NODE_STATE_STATUS.completed,
]);

/** Whether a node-state counts as `completed`. */
export function isCompleted(state: NodeStateView | undefined): boolean {
  return state?.status === NODE_STATE_STATUS.completed;
}

/** Whether a node has been reached (entered) at least once. */
export function isReached(state: NodeStateView | undefined): boolean {
  return state !== undefined && REACHED_STATUSES.has(state.status);
}

/** Evaluate one gate condition. `true` ⇒ satisfied (does not block). */
export function evaluateCondition(condition: MapCondition, ctx: ConditionContext): boolean {
  switch (condition.family) {
    case 'state':
      return isCompleted(ctx.nodeState(condition.milestone)) === condition.reached;
    case 'slot': {
      const reading = ctx.slot(condition.slug);
      if (reading === undefined) return false;
      if (condition.minConfidence !== undefined && reading.confidence < condition.minConfidence) {
        return false;
      }
      return compareScalar(reading.valueJson, condition.op, condition.value);
    }
    case 'temporal':
      return evaluateTemporal(condition, ctx);
  }
}

/** Compare a slot's typed value against a gate value. Only scalars compare; `gte`/
 *  `lte` need matching orderable types (both number or both string). */
function compareScalar(
  raw: unknown,
  op: 'gte' | 'lte' | 'eq',
  target: number | string | boolean
): boolean {
  if (op === 'eq') return raw === target;
  if (typeof raw === 'number' && typeof target === 'number') {
    return op === 'gte' ? raw >= target : raw <= target;
  }
  if (typeof raw === 'string' && typeof target === 'string') {
    return op === 'gte' ? raw >= target : raw <= target;
  }
  return false;
}

/** Evaluate a temporal predicate against `now` and (for cooldown) the target node. */
function evaluateTemporal(
  condition: Extract<MapCondition, { family: 'temporal' }>,
  ctx: ConditionContext
): boolean {
  switch (condition.kind) {
    case 'available_after':
      // `at` is schema-guaranteed for date kinds; an unparseable value ⇒ NaN ⇒ false.
      return condition.at !== undefined && ctx.now.getTime() >= Date.parse(condition.at);
    case 'available_until':
      return condition.at !== undefined && ctx.now.getTime() <= Date.parse(condition.at);
    case 'recommended_by':
      // Advisory only — a soft deadline guidance ranks by; never gates eligibility.
      return true;
    case 'cooldown_since_last_visit': {
      const last = ctx.target?.lastActiveAt;
      // Never visited (or a malformed duration) ⇒ no cooldown to enforce yet.
      if (last === null || last === undefined || condition.durationHours === undefined) return true;
      return ctx.now.getTime() - last.getTime() >= condition.durationHours * 3_600_000;
    }
  }
}

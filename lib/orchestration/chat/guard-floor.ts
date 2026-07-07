/**
 * Guard-floor contributor registry.
 *
 * A generic extension seam for the chat handler's inline guard modes (input / output / citation).
 * Any subsystem can register a contributor that, given a turn's context (`contextType` /
 * `contextId` / `agentId`), returns a per-guard **minimum** mode. `resolveGuardFloors` merges the
 * strictest floor per guard across all contributors; the handler raises each guard to that floor
 * with `applyGuardFloor`.
 *
 * Contributors only ever **raise** a guard (`log_only < warn_and_continue < block`) — they can
 * never lower the mode the agent/global settings already resolved. An **empty registry reproduces
 * the handler's prior behaviour exactly**: `resolveGuardFloors` returns `{}` and `applyGuardFloor`
 * returns the base mode unchanged. A contributor that throws is skipped (a floor lookup must never
 * break a turn).
 *
 * Keyed by a string id so a repeated registration (e.g. a re-run boot hook) replaces rather than
 * duplicates. Contributors run on the chat hot path — keep them cheap. This is the same shape as
 * `registerAgentAccessContributor` / `registerContextContributor`: core owns the registry;
 * extensions register into it in the allowed inbound direction, so no core code references a
 * specific extension.
 */

export type GuardKind = 'input' | 'output' | 'citation';
export type GuardFloorMode = 'log_only' | 'warn_and_continue' | 'block';

/** The context a contributor keys its floor on. All fields are the turn's own values. */
export interface GuardFloorContext {
  contextType?: string;
  contextId?: string;
  agentId: string;
}

/** A per-guard minimum mode; an absent guard means "no floor" (leave the base mode). */
export type GuardFloorContribution = Partial<Record<GuardKind, GuardFloorMode>>;

export type GuardFloorContributor = (ctx: GuardFloorContext) => Promise<GuardFloorContribution>;

const contributors = new Map<string, GuardFloorContributor>();

/** Strictness ordering — a higher rank is a stricter guard. Unknown modes rank lowest (0). */
const RANK: Record<string, number> = {
  none: 0,
  log_only: 1,
  warn_and_continue: 2,
  block: 3,
};

/**
 * Register (or replace, by `key`) a contributor consulted for every guarded turn. Idempotent per
 * key so a double boot is harmless.
 */
export function registerGuardFloorContributor(
  key: string,
  contributor: GuardFloorContributor
): void {
  contributors.set(key, contributor);
}

/** Test-only: drop all registered contributors. */
export function __resetGuardFloorContributorsForTests(): void {
  contributors.clear();
}

/**
 * The strictest floor per guard across all contributors for this turn, or `{}` when none apply.
 * When the registry is empty this is `{}` (the seam is inert — vanilla behaviour). A contributor
 * that throws is skipped.
 */
export async function resolveGuardFloors(ctx: GuardFloorContext): Promise<GuardFloorContribution> {
  if (contributors.size === 0) return {};

  const merged: GuardFloorContribution = {};
  for (const contributor of contributors.values()) {
    let contribution: GuardFloorContribution;
    try {
      contribution = await contributor(ctx);
    } catch {
      continue; // a floor lookup must never break a turn
    }
    for (const kind of ['input', 'output', 'citation'] as const) {
      const floor = contribution[kind];
      if (floor && RANK[floor] > (merged[kind] ? RANK[merged[kind]] : -1)) merged[kind] = floor;
    }
  }
  return merged;
}

/**
 * Raise `base` to `floor` when `floor` is stricter, else return `base` unchanged. `floor`
 * undefined (no contributor floor for this guard) always returns `base` — so the seam never lowers
 * a guard and is a no-op when inert.
 */
export function applyGuardFloor(base: string, floor?: GuardFloorMode): string {
  if (floor === undefined) return base;
  return (RANK[floor] ?? 0) > (RANK[base] ?? 0) ? floor : base;
}

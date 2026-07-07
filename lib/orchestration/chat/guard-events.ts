/**
 * Guard-event contributor registry.
 *
 * A generic extension seam letting a higher layer OBSERVE an inline guard firing (input / output /
 * citation) for a turn and react — e.g. route a detected safety signal into a configured escalation
 * pathway. This is the POST-detection sibling of the guard-floor seam (`./guard-floor.ts`): the
 * guard-floor contributor runs BEFORE detection and returns a *mode to raise to*; a guard-event
 * contributor runs AFTER a guard flags and is a fire-and-forget *observer* — it cannot change the
 * turn's outcome, only react to it.
 *
 * `emitGuardEvent` is fire-and-forget: contributors run detached (never awaited), and any throw is
 * swallowed — a guard-event handler must never delay or break a turn. An **empty registry is
 * completely inert** (emit is a no-op), so vanilla behaviour is unchanged. Keyed by a string id so a
 * repeated registration (e.g. a re-run boot hook) replaces rather than duplicates — the same shape
 * as `registerGuardFloorContributor` / `registerAgentAccessContributor`; core owns the registry,
 * extensions register inbound, no core code references a specific extension.
 */

import type { GuardKind } from '@/lib/orchestration/chat/guard-floor';

/** What a guard did to a flagged turn: `flagged` = detected (log_only/warn), `blocked` = hard-stopped. */
export type GuardOutcome = 'flagged' | 'blocked';

/** The turn context a guard-event contributor keys on. Superset of `GuardFloorContext`: it also
 *  carries `userId`/`conversationId` so an observer can act on the affected conversation (notify,
 *  log). All fields are the turn's own values. */
export interface GuardEventContext {
  contextType?: string;
  contextId?: string;
  agentId: string;
  userId: string;
  conversationId: string;
}

/** A guard firing: which guard, and whether it merely flagged or hard-blocked. */
export interface GuardEvent {
  guard: GuardKind;
  outcome: GuardOutcome;
}

export type GuardEventContributor = (
  ctx: GuardEventContext,
  event: GuardEvent
) => void | Promise<void>;

const contributors = new Map<string, GuardEventContributor>();

/**
 * Register (or replace, by `key`) a contributor observed for every guard firing. Idempotent per key
 * so a double boot is harmless.
 */
export function registerGuardEventContributor(
  key: string,
  contributor: GuardEventContributor
): void {
  contributors.set(key, contributor);
}

/** Test-only: drop all registered contributors. */
export function __resetGuardEventContributorsForTests(): void {
  contributors.clear();
}

/**
 * Notify every registered contributor that a guard fired — **fire-and-forget**. Contributors run
 * detached (not awaited) and their throws are swallowed, so this never delays or breaks the turn.
 * A no-op when the registry is empty (the seam is inert — vanilla behaviour).
 */
export function emitGuardEvent(ctx: GuardEventContext, event: GuardEvent): void {
  for (const contributor of contributors.values()) {
    void (async () => {
      try {
        await contributor(ctx, event);
      } catch {
        // a guard-event handler must never break a turn
      }
    })();
  }
}

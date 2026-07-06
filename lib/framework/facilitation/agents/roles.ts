/**
 * Facilitation seat vocabulary (f-facilitation-agents t-1).
 *
 * The fixed, framework-defined set of facilitation **seats** an `AiAgent` may be bound to
 * (spec §5.4). Unlike a module's `agentRoles` (declared per module in code), the facilitation
 * roles are the same across every deployment, so they live in one framework-owned constant
 * (mirroring how `journey/vocabulary.ts` holds `NODE_STATE_STATUS`). The binding service
 * validates `role ∈ FACILITATION_ROLES`; there is no per-instance role declaration to check.
 *
 * The roles map to the guidance capabilities each is typically granted (spec §5.4) — a
 * documented reference, not enforced here: `state`/`orientation` → `get_journey_state`,
 * `path` → `get_next_steps`, `synopsis` → `get_progress_synopsis`, `facilitator` →
 * `suggest_focus`, and `request_transition` where a seat moves the journey. Granting itself
 * is the ordinary `AiAgentCapability` mechanism.
 */

export const FACILITATION_ROLES = {
  /** Welcome / discovery — the first-contact seat. */
  onboarding: 'onboarding',
  /** Orients the user to where they are and what's around. */
  orientation: 'orientation',
  /** Narrates a progress synopsis (event-log digest). */
  synopsis: 'synopsis',
  /** Reports the current journey state. */
  state: 'state',
  /** Surfaces and paces the next steps. */
  path: 'path',
  /** The distinct facilitator/supervisor persona the user occasionally meets. */
  facilitator: 'facilitator',
} as const;

export type FacilitationRole = (typeof FACILITATION_ROLES)[keyof typeof FACILITATION_ROLES];

/** The role strings, for iteration / error messages. */
export const FACILITATION_ROLE_VALUES: readonly string[] = Object.values(FACILITATION_ROLES);

/** Type guard: is `role` a declared facilitation seat? */
export function isFacilitationRole(role: string): role is FacilitationRole {
  return FACILITATION_ROLE_VALUES.includes(role);
}

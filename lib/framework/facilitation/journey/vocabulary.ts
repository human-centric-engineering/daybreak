/**
 * Journey vocabulary — the free-form `String` value set for `UserNodeState.status`
 * (spec §5.2).
 *
 * A node's standing in a user's journey is stored as a free-form `String` on the
 * row — convention X1: no Prisma enum, so a new status is never a migration and
 * forks merge cleanly. Code that reads or writes the column shares the constants
 * here so a typo can't silently mint an unrecognised status. The allowed-value
 * comment on the Prisma model and this list are the same set; keep them in step.
 *
 * The deterministic engine (`f-engine`, feature 11) is the sole writer of these
 * values (F11); this vocabulary is the shared contract between the model shipped
 * here and that writer.
 */

/**
 * A node's standing in one user's journey (spec §5.2):
 * - `unvisited`  — not yet reached (the default before the engine touches it).
 * - `available`  — reachable now: its prerequisites + gating conditions are met.
 * - `active`     — the user is currently in this node.
 * - `visited`    — entered before (a repeatable node the user has left).
 * - `completed`  — finished per the node's `completionMode` (a `once` node closes;
 *                  a `repeatable` node may reopen — `timesCompleted` tracks passes).
 */
export const NODE_STATE_STATUS = {
  unvisited: 'unvisited',
  available: 'available',
  active: 'active',
  visited: 'visited',
  completed: 'completed',
} as const;

/** A known node-state status literal. */
export type NodeStateStatus = (typeof NODE_STATE_STATUS)[keyof typeof NODE_STATE_STATUS];

/**
 * The journey-traversal `JourneyEvent.type` values the engine writes (spec §5.2,
 * free-form/X1 — `f-engagement` adds more kinds to the same stream without a
 * migration). Kept here, next to the status vocab, because this module is DB- and
 * server-free so **both** the engine writer (`apply-event.ts` re-exports this as
 * `ENGINE_EVENT_TYPE`) **and** the client journey-explorer replay reducer can share
 * one source — a client bundle must not reach into the engine module for a string.
 */
export const JOURNEY_EVENT_TYPE = {
  nodeEntered: 'node_entered',
  nodeCompleted: 'node_completed',
} as const;

/** A known journey-traversal event-type literal. */
export type JourneyEventType = (typeof JOURNEY_EVENT_TYPE)[keyof typeof JOURNEY_EVENT_TYPE];

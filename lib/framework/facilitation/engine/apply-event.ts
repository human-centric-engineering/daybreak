/**
 * `applyEvent` (f-engine t-3) — the **sole writer** of journey state (spec §5.3,
 * F11). Agents and APIs *request* a transition; the engine is the only thing that
 * mutates state, and only through a validated transition.
 *
 * Contract:
 * - **Entry requires availability** (decision 7): an `enter` is validated against the
 *   same `computeAvailability` the read side uses, so a hallucinated
 *   `enter('locked-thing')` is **rejected with a structured reason** (the node's own
 *   lock reasons), not obeyed. A `complete` requires the node to be currently `active`
 *   (you must have entered it).
 * - **Once/repeatable semantics** (F6): a `once` node closes on completion; a
 *   `repeatable` node increments `timesCompleted` and reopens (its cooldown, if any,
 *   is an edge condition the read side already enforces).
 * - **One transaction** (F10): every accepted transition appends the immutable
 *   `JourneyEvent` (source of truth) **and** upserts the `UserNodeState` projection in
 *   a single `executeTransaction`, mirroring `appendSlotValue`. The event carries
 *   `userId` on every row (decision 5 — the erasure path). No engine-side retry: the
 *   `@@unique([journeyId, nodeKey])` backstops concurrent upserts and a P2002 rolls
 *   the transaction back for the caller to re-request.
 *
 * Scope (decision 8): this is the validated *library* writer. The agent-facing
 * capabilities that call it (`enter_module` / `complete_node`, and the assembler that
 * loads the graph + state + slots + liveness + `canRead`-guards the reads) are
 * `f-guidance` / `f-facilitation-agents`. This ships the writer + its proof (units +
 * a real-DB smoke), the `getSlotHeads`-before-`f-slot-capture` pattern. The read
 * inputs (graph, node-states, slots, module-liveness, `now`) are the caller's, exactly
 * as `computeAvailability` takes them; only the write is the engine's.
 */

import type { JourneyEvent, Prisma, UserNodeState } from '@prisma/client';
import { executeTransaction } from '@/lib/db/utils';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import type { ModuleLiveness } from '@/lib/framework/modules/liveness';
import type { SlotReadingView } from '@/lib/framework/facilitation/engine/conditions';
import {
  computeAvailability,
  type JourneyNodeState,
  type LockReason,
} from '@/lib/framework/facilitation/engine/availability';

/** The `JourneyEvent.type` values the engine writes (free-form, X1). `f-engagement`
 *  adds more kinds to the same stream without a migration. */
export const ENGINE_EVENT_TYPE = {
  nodeEntered: 'node_entered',
  nodeCompleted: 'node_completed',
} as const;

/** A requested transition against one node of a journey. */
export type TransitionKind = 'enter' | 'complete';
export interface Transition {
  /** The journey owner (the `JourneyEvent.userId` erasure key). */
  userId: string;
  /** The journey being walked (`UserJourney.id`). */
  journeyId: string;
  /** The node the transition acts on. */
  nodeKey: string;
  kind: TransitionKind;
  /** Optional event payload stored on the `JourneyEvent`. */
  payload?: Prisma.InputJsonValue;
}

/** Inputs to {@link applyEvent}: the transition plus the read context (the caller's,
 *  like {@link computeAvailability}). */
export interface ApplyEventInput {
  transition: Transition;
  graph: GraphStore;
  nodeStates: readonly JourneyNodeState[];
  slots: readonly SlotReadingView[];
  moduleLiveness: ReadonlyMap<string, ModuleLiveness>;
  now: Date;
}

/** Why a transition was refused — structured so the caller can narrate it (F11). */
export interface Rejection {
  code: 'unknown_node' | 'not_available' | 'not_active';
  message: string;
  /** The node's lock reasons, for a `not_available` refusal. */
  lockReasons?: readonly LockReason[];
}

/** The outcome: the written projection + event, or a structured rejection with no write. */
export type ApplyEventResult =
  { ok: true; nodeState: UserNodeState; event: JourneyEvent } | { ok: false; rejection: Rejection };

/** The projection fields a transition sets (create + update share them). */
interface ProjectionFields {
  status: string;
  timesCompleted: number;
  firstEnteredAt: Date;
  lastActiveAt: Date;
  completedAt: Date | null;
}

/**
 * Validate a requested transition and, if legal, write it (event + projection) in one
 * transaction. Rejections happen **before** any write, so a refused transition never
 * touches the database.
 */
export async function applyEvent(input: ApplyEventInput): Promise<ApplyEventResult> {
  const { transition, graph, now } = input;
  const { nodeKey, journeyId } = transition;

  const node = graph.node(nodeKey);
  if (node === undefined) {
    return refuse('unknown_node', `No node "${nodeKey}" in the published map.`);
  }

  if (transition.kind === 'enter') {
    const availability = computeAvailability({
      graph,
      nodeStates: input.nodeStates,
      slots: input.slots,
      moduleLiveness: input.moduleLiveness,
      now,
    });
    const verdict = availability.perNode.get(nodeKey);
    if (verdict === undefined || !verdict.available) {
      return {
        ok: false,
        rejection: {
          code: 'not_available',
          message: `Node "${nodeKey}" is not available to enter.`,
          lockReasons: verdict?.lockReasons ?? [],
        },
      };
    }
  } else {
    const current = input.nodeStates.find((s) => s.nodeKey === nodeKey);
    if (current?.status !== NODE_STATE_STATUS.active) {
      return refuse('not_active', `Node "${nodeKey}" is not active; enter it before completing.`);
    }
  }

  const eventType =
    transition.kind === 'enter' ? ENGINE_EVENT_TYPE.nodeEntered : ENGINE_EVENT_TYPE.nodeCompleted;

  return executeTransaction(async (tx) => {
    // Read the current projection fresh inside the transaction so `timesCompleted`
    // increments off the committed value, not the caller's snapshot.
    const current = await tx.userNodeState.findUnique({
      where: { journeyId_nodeKey: { journeyId, nodeKey } },
    });
    const fields = nextProjection(transition.kind, current, now);

    const nodeState = await tx.userNodeState.upsert({
      where: { journeyId_nodeKey: { journeyId, nodeKey } },
      create: { journeyId, nodeKey, ...fields },
      update: fields,
    });

    const event = await tx.journeyEvent.create({
      data: {
        userId: transition.userId,
        journeyId,
        nodeKey,
        moduleSlug: node.moduleSlug ?? null,
        type: eventType,
        occurredAt: now,
        ...(transition.payload !== undefined ? { payload: transition.payload } : {}),
      },
    });

    return { ok: true, nodeState, event };
  });
}

/** The projection fields after a transition, computed off the committed row. */
function nextProjection(
  kind: TransitionKind,
  current: UserNodeState | null,
  now: Date
): ProjectionFields {
  if (kind === 'enter') {
    return {
      status: NODE_STATE_STATUS.active,
      timesCompleted: current?.timesCompleted ?? 0,
      firstEnteredAt: current?.firstEnteredAt ?? now,
      lastActiveAt: now,
      completedAt: current?.completedAt ?? null,
    };
  }
  // complete — `once` closes, `repeatable` reopens; both stamp the latest pass.
  return {
    status: NODE_STATE_STATUS.completed,
    timesCompleted: (current?.timesCompleted ?? 0) + 1,
    firstEnteredAt: current?.firstEnteredAt ?? now,
    lastActiveAt: now,
    completedAt: now,
  };
}

function refuse(code: Rejection['code'], message: string): ApplyEventResult {
  return { ok: false, rejection: { code, message } };
}

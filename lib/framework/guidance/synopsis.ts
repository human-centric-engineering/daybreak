/**
 * Progress synopsis (f-guidance t-1, spec §5.4) — **pure, deterministic**.
 *
 * A structured digest of a journey's standing, computed from the node-state projection +
 * the event timeline. It is deliberately **not** an LLM narration: guidance stays pure and
 * testable (the layer's discipline — _engine + guidance compute; agents narrate_), and prose
 * richness lives at the narration layer (the `get_progress_synopsis` agent renders this digest).
 */

import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

/** The node-state fields the digest reads (a `UserNodeState` satisfies this). */
export interface SynopsisNodeState {
  nodeKey: string;
  status: string;
}

/** The timeline-event fields the digest reads (a `JourneyEvent` satisfies this). */
export interface SynopsisEvent {
  nodeKey: string | null;
  type: string;
  occurredAt: Date;
}

/** One digested recent transition (dates serialised for a JSON-safe payload). */
export interface SynopsisTransition {
  nodeKey: string | null;
  type: string;
  occurredAt: string;
}

/** The deterministic progress digest. */
export interface ProgressSynopsis {
  /** Nodes with any recorded state (the projection's row count — not the map's node total). */
  totalTracked: number;
  completed: number;
  active: number;
  visited: number;
  available: number;
  /** Completed node keys, in node-state order — the milestones reached. */
  milestones: readonly string[];
  /** The most-recent transitions, newest first. */
  recent: readonly SynopsisTransition[];
}

const DEFAULT_RECENT_LIMIT = 5;

export interface BuildSynopsisOptions {
  /** How many recent transitions to include (newest first). Default 5; `0` ⇒ none. */
  recentLimit?: number;
}

/**
 * Build the progress digest. Pure — `nodeStates` and `timeline` are supplied by the caller
 * (the `canRead`-guarded reads happen in `guidance.ts`). `recent` is the newest
 * `recentLimit` events by `occurredAt`, independent of the input ordering.
 */
export function buildProgressSynopsis(
  nodeStates: readonly SynopsisNodeState[],
  timeline: readonly SynopsisEvent[],
  options?: BuildSynopsisOptions
): ProgressSynopsis {
  let completed = 0;
  let active = 0;
  let visited = 0;
  let available = 0;
  const milestones: string[] = [];

  for (const state of nodeStates) {
    switch (state.status) {
      case NODE_STATE_STATUS.completed:
        completed += 1;
        milestones.push(state.nodeKey);
        break;
      case NODE_STATE_STATUS.active:
        active += 1;
        break;
      case NODE_STATE_STATUS.visited:
        visited += 1;
        break;
      case NODE_STATE_STATUS.available:
        available += 1;
        break;
      default: // unvisited / any future free-string status — counted only in totalTracked
        break;
    }
  }

  const limit = options?.recentLimit ?? DEFAULT_RECENT_LIMIT;
  const recent = [...timeline]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, Math.max(0, limit))
    .map((e) => ({ nodeKey: e.nodeKey, type: e.type, occurredAt: e.occurredAt.toISOString() }));

  return {
    totalTracked: nodeStates.length,
    completed,
    active,
    visited,
    available,
    milestones,
    recent,
  };
}

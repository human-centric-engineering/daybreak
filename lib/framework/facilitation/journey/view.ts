/**
 * Journey admin-view wire types (f-ops-views t-5a).
 *
 * The JSON-serialised shapes the journey-explorer endpoints return — the honest
 * over-the-wire form of the `UserJourney` / `UserNodeState` / `JourneyEvent` rows
 * and the published map structure. **Dates are ISO `string`s, not `Date`** (a
 * fetched row is JSON): typing them as the raw Prisma models would be a type-lie
 * the client can't honour (the convention `f-ops-views` established in t-1's
 * `modules/view.ts`). The map structure reuses the pure, date-free `MapDefinition`
 * (`facilitation/map/schema.ts`), so it needs no restatement here.
 *
 * Consumed by the t-5b explorer UI; kept in a view module (not the query module)
 * so the client wire contract is one importable place, free of Prisma types.
 */

import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';

/** Completed-vs-total node standing for a journey, for the picker's progress cell. */
export interface JourneyProgress {
  /** Node-state rows the engine has materialised for this journey. */
  total: number;
  /** How many of those are `completed` (journey vocabulary). */
  completed: number;
}

/** One row in the explorer picker list. */
export interface JourneyListItem {
  id: string;
  /** The journey owner (the access subject). */
  userId: string;
  graphSlug: string;
  /** Parallel-instance discriminator; `''` is the default context-free journey. */
  contextKey: string;
  startedAt: string;
  /** The map's display fields, stitched by `graphSlug`; `null` if the map is gone. */
  graph: { name: string; slug: string } | null;
  progress: JourneyProgress;
}

/** A node's standing in the journey — the `UserNodeState` projection, wire form. */
export interface JourneyNodeStateView {
  nodeKey: string;
  status: string;
  timesCompleted: number;
  firstEnteredAt: string | null;
  lastActiveAt: string | null;
  completedAt: string | null;
}

/** One event in the journey timeline — the `JourneyEvent` log, wire form. */
export interface JourneyEventView {
  id: string;
  type: string;
  nodeKey: string | null;
  moduleSlug: string | null;
  occurredAt: string;
}

/**
 * The full detail bundle for one journey: the identity, the published map
 * structure it is walked against (or `null` when the map has no published version
 * / is gone / fails to parse — degrade honestly, never a fake empty map), the
 * current node-state overlay, and the full chronological timeline for replay.
 */
export interface JourneyDetailView {
  journey: {
    id: string;
    userId: string;
    graphSlug: string;
    contextKey: string;
    startedAt: string;
  };
  /** The map by `graphSlug`; `structure` is `null` when nothing is published/parseable. */
  graph: { name: string; slug: string; structure: MapDefinition | null } | null;
  nodeStates: JourneyNodeStateView[];
  /** Chronological (`occurredAt asc`) — the replay scrubber steps forward through it. */
  timeline: JourneyEventView[];
}

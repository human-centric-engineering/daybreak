/**
 * Collective map heat / drop-off (f-engagement-analytics t-1, spec §4.3, A9) — the
 * per-node, cross-user read side.
 *
 * Where `getModuleStats` aggregates the stream by `moduleSlug`, this aggregates it by
 * `nodeKey` over **one map's** journeys — the collective traffic and drop-off the
 * heat overlay paints onto the published structure. Every figure is DERIVED from the
 * insert-only `JourneyEvent` stream (A9 — never a counter): the engine already stamps
 * `node_entered` / `node_completed` with both `journeyId` and `nodeKey`, so heat needs
 * no new emit.
 *
 * **Map scoping goes through `UserJourney`.** `JourneyEvent` carries no `graphSlug`
 * column (X1 keeps the stream schema minimal), so we resolve the map's journey ids
 * first (`UserJourney where graphSlug`) and filter events to that set. The one
 * `groupBy(['nodeKey','type','userId'])` yields, per row, one **distinct user** for a
 * `(node, type)` plus that user's event count — enough to fold BOTH event volume
 * (traffic) AND distinct-user counts (the honest basis for drop-off: a user re-entering
 * a repeatable node must not inflate it).
 *
 * **Subject-scope seam.** `getMapHeat` accepts an optional `{ userId }` filter — the
 * #367 subject-scope axis at the analytics layer, mirroring `getModuleStats`. The admin
 * surface passes none today (a cross-user aggregate under `withAdminAuth`); the query is
 * one WHERE clause from owner/team/cohort-scoped heat, not a rewrite.
 *
 * **Scale.** v1 reads are Prisma `groupBy` — fine at single-tenant volume. The scale
 * follow-ups when the event table grows (a `framework_journey_event (journeyId, nodeKey)`
 * index, or a denormalised `graphSlug` column skipping the journey-id join) are
 * deliberately NOT shipped speculatively (mirrors `getModuleStats` decision 6).
 */

import { prisma } from '@/lib/db/client';
import { JOURNEY_EVENT_TYPE } from '@/lib/framework/facilitation/journey/vocabulary';

/** Collective engagement for one map node, all derived from the event stream (A9). */
export interface MapNodeHeat {
  nodeKey: string;
  /** Distinct users with ANY traversal event on the node. */
  distinctUsers: number;
  /** Total `node_entered` events (traffic volume — repeats included). */
  entries: number;
  /** Total `node_completed` events. */
  completions: number;
  /** Distinct users who entered the node at least once. */
  enteredUsers: number;
  /** Distinct users who completed the node at least once. */
  completedUsers: number;
  /** Distinct users who entered but never completed (`enteredUsers − completedUsers`). */
  dropOff: number;
}

/** A map's per-node heat, one entry per node the stream has activity for (cold nodes absent). */
export interface MapHeat {
  graphSlug: string;
  nodes: MapNodeHeat[];
}

/** Restrict heat to a subject (the #367 axis). Absent = all users (the admin default). */
export interface MapHeatFilter {
  userId?: string;
}

/** Per-node accumulator during the fold; sets dedupe users across event rows. */
interface HeatAccumulator {
  distinct: Set<string>;
  enteredUsers: Set<string>;
  completedUsers: Set<string>;
  entries: number;
  completions: number;
}

/**
 * Compute a map's collective per-node heat + drop-off from the `JourneyEvent` stream.
 * Cross-user by default; pass `filter.userId` to scope every figure to one subject.
 * Returns a node entry only for nodes the stream has traversal activity for — the
 * caller joins these onto the published structure, so cold nodes render as zero-heat.
 */
export async function getMapHeat(graphSlug: string, filter: MapHeatFilter = {}): Promise<MapHeat> {
  // Map-scope through UserJourney (the stream has no graphSlug column). Narrow to one
  // subject here too when filtering, so the event query stays a plain journeyId-in-set.
  const journeys = await prisma.userJourney.findMany({
    where: { graphSlug, ...(filter.userId !== undefined ? { userId: filter.userId } : {}) },
    select: { id: true },
  });
  if (journeys.length === 0) return { graphSlug, nodes: [] };

  const journeyIds = journeys.map((j) => j.id);

  // One row per (nodeKey, type, userId): a distinct user for that (node, type) plus that
  // user's event count. Only the two traversal kinds; only rows carrying a node.
  const rows = await prisma.journeyEvent.groupBy({
    by: ['nodeKey', 'type', 'userId'],
    where: {
      journeyId: { in: journeyIds },
      nodeKey: { not: null },
      type: { in: [JOURNEY_EVENT_TYPE.nodeEntered, JOURNEY_EVENT_TYPE.nodeCompleted] },
    },
    _count: { _all: true },
  });

  const byNode = new Map<string, HeatAccumulator>();
  for (const row of rows) {
    // `nodeKey: { not: null }` guarantees non-null, but the groupBy key type is nullable.
    if (row.nodeKey === null) continue;
    const acc =
      byNode.get(row.nodeKey) ??
      ({
        distinct: new Set<string>(),
        enteredUsers: new Set<string>(),
        completedUsers: new Set<string>(),
        entries: 0,
        completions: 0,
      } satisfies HeatAccumulator);
    acc.distinct.add(row.userId);
    const n = row._count._all;
    if (row.type === JOURNEY_EVENT_TYPE.nodeEntered) {
      acc.entries += n;
      acc.enteredUsers.add(row.userId);
    } else if (row.type === JOURNEY_EVENT_TYPE.nodeCompleted) {
      acc.completions += n;
      acc.completedUsers.add(row.userId);
    }
    byNode.set(row.nodeKey, acc);
  }

  // Stable order (nodeKey) so the payload is deterministic across reads.
  const nodes: MapNodeHeat[] = [...byNode.entries()]
    .map(([nodeKey, a]) => ({
      nodeKey,
      distinctUsers: a.distinct.size,
      entries: a.entries,
      completions: a.completions,
      enteredUsers: a.enteredUsers.size,
      completedUsers: a.completedUsers.size,
      dropOff: Math.max(0, a.enteredUsers.size - a.completedUsers.size),
    }))
    .sort((x, y) => x.nodeKey.localeCompare(y.nodeKey));

  return { graphSlug, nodes };
}

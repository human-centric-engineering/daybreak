/**
 * `checkLiveKeyImpact` (f-engine t-4) — the non-blocking live-key-removal **warning**
 * (F2), split from the pure `invariants.ts` because it needs journey-state I/O (B12,
 * the schema-vs-version-service pattern).
 *
 * F2: warn the admin when publishing would **remove** a node key that journeys still
 * hold live state on — that state has no node to interpret against until the engine
 * reconciles it. A warning, never a block: the publish surface calls this to surface
 * impact; it does not ride the throwing `validatePublishableMap` chain.
 */

import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import { prisma } from '@/lib/db/client';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

/** A non-blocking warning that publishing would orphan live user state (F2). */
export interface LiveKeyWarning {
  code: 'LIVE_KEY_REMOVED';
  nodeKey: string;
  /** How many of this graph's journeys hold live (non-`unvisited`) state on the key. */
  liveJourneyCount: number;
  message: string;
}

/**
 * Warn when publishing `nextDefinition` over `previousDefinition` would remove a node
 * key that journeys on `graphSlug` still hold live state on. Returns `[]` when nothing
 * is removed (or nothing live is affected).
 *
 * Re-gating (a key kept but with changed conditions) is a documented follow-up — this
 * covers the load-bearing removal case (F2's exact wording).
 */
export async function checkLiveKeyImpact(
  graphSlug: string,
  previousDefinition: MapDefinition,
  nextDefinition: MapDefinition
): Promise<LiveKeyWarning[]> {
  const nextKeys = new Set(nextDefinition.nodes.map((n) => n.key));
  const removedKeys = previousDefinition.nodes.map((n) => n.key).filter((k) => !nextKeys.has(k));
  if (removedKeys.length === 0) return [];

  // One `UserNodeState` per (journey, node) key, so a count of live rows per key is a
  // count of affected journeys. Scoped to this graph via the journey relation.
  const grouped = await prisma.userNodeState.groupBy({
    by: ['nodeKey'],
    where: {
      journey: { graphSlug },
      nodeKey: { in: removedKeys },
      status: { not: NODE_STATE_STATUS.unvisited },
    },
    _count: { _all: true },
  });

  return grouped.map((row) => ({
    code: 'LIVE_KEY_REMOVED',
    nodeKey: row.nodeKey,
    liveJourneyCount: row._count._all,
    message: `Removing node "${row.nodeKey}" would orphan live state in ${row._count._all} journey(s).`,
  }));
}

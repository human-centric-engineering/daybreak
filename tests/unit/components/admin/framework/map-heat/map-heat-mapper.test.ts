/**
 * Map-heat mapper (f-engagement-analytics t-1b) — the pure fold of collective heat onto
 * the reused journey layout. No React, so plain TS. Proves: every structural node gets a
 * node (heat folded where present, zero-filled where cold), the bucket is relative to the
 * map max for the active metric, the metric switch re-buckets, and an event for a node the
 * published map no longer contains is dropped.
 *
 * @see components/admin/framework/map-heat/map-heat-mapper.ts
 */

import { describe, it, expect } from 'vitest';

import { toHeatFlow } from '@/components/admin/framework/map-heat/map-heat-mapper';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type { MapHeat, MapNodeHeat } from '@/lib/framework/engagement/map-heat';

type MapNode = MapDefinition['nodes'][number];
type MapEdge = MapDefinition['edges'][number];

function node(key: string, over: Partial<MapNode> = {}): MapNode {
  return { key, type: 'module', completionMode: 'once', ...over };
}
function edge(from: string, to: string, type: MapEdge['type']): MapEdge {
  return { from, to, type };
}
function heatNode(nodeKey: string, over: Partial<MapNodeHeat> = {}): MapNodeHeat {
  return {
    nodeKey,
    distinctUsers: 0,
    entries: 0,
    completions: 0,
    enteredUsers: 0,
    completedUsers: 0,
    dropOff: 0,
    ...over,
  };
}

const STRUCTURE: MapDefinition = {
  nodes: [node('a', { moduleSlug: 'welcome' }), node('b'), node('c')],
  edges: [edge('a', 'b', 'prerequisite'), edge('b', 'c', 'prerequisite')],
};

const byId = <T extends { id: string }>(nodes: T[]) => new Map(nodes.map((n) => [n.id, n]));

describe('toHeatFlow', () => {
  it('folds heat onto each structural node and zero-fills cold nodes', () => {
    const heat: MapHeat = {
      graphSlug: 'm',
      nodes: [heatNode('a', { distinctUsers: 10, entries: 14, completions: 8, dropOff: 2 })],
    };

    const { nodes, edges } = toHeatFlow(STRUCTURE, heat, 'traffic');

    expect(nodes).toHaveLength(3); // one per structural node
    expect(edges).toHaveLength(2);
    const map = byId(nodes);
    expect(map.get('a')!.data.heat.distinctUsers).toBe(10);
    expect(map.get('a')!.data.moduleSlug).toBe('welcome'); // module binding carried through
    expect(map.get('b')!.data.moduleSlug).toBeUndefined(); // non-module node has none
    // A structural node with no stream activity zero-fills, not undefined.
    expect(map.get('c')!.data.heat.distinctUsers).toBe(0);
    expect(map.get('c')!.data.bucket).toBe(0);
  });

  it('buckets relative to the map max for the active metric (busiest node = 4)', () => {
    const heat: MapHeat = {
      graphSlug: 'm',
      nodes: [
        heatNode('a', { distinctUsers: 10, dropOff: 1 }),
        heatNode('b', { distinctUsers: 5, dropOff: 8 }),
      ],
    };

    const traffic = byId(toHeatFlow(STRUCTURE, heat, 'traffic').nodes);
    expect(traffic.get('a')!.data.bucket).toBe(4); // max users
    expect(traffic.get('b')!.data.bucket).toBe(2); // ceil(5/10*4)

    // Switching metric re-buckets against the drop-off max (b is now the hot node).
    const dropoff = byId(toHeatFlow(STRUCTURE, heat, 'dropoff').nodes);
    expect(dropoff.get('b')!.data.bucket).toBe(4); // max drop-off
    expect(dropoff.get('a')!.data.bucket).toBe(1); // ceil(1/8*4)
    expect(dropoff.get('a')!.data.metric).toBe('dropoff');
  });

  it('drops heat for a node the published structure no longer contains', () => {
    const heat: MapHeat = {
      graphSlug: 'm',
      nodes: [heatNode('a', { distinctUsers: 3 }), heatNode('ghost', { distinctUsers: 99 })],
    };

    const { nodes } = toHeatFlow(STRUCTURE, heat, 'traffic');
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']); // no 'ghost'
    // 'ghost' (99) is excluded from layout but was it the max? It should NOT set the scale,
    // because only structural nodes render — a's 3 is the only rendered traffic value.
    expect(byId(nodes).get('a')!.data.bucket).toBe(4);
  });

  it('renders an all-neutral map when there is no activity', () => {
    const { nodes } = toHeatFlow(STRUCTURE, { graphSlug: 'm', nodes: [] }, 'traffic');
    expect(nodes.every((n) => n.data.bucket === 0)).toBe(true);
  });
});

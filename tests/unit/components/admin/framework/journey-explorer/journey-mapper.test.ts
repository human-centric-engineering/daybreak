/**
 * Journey mapper (f-ops-views t-5b) — the pure layout + status-overlay + replay logic
 * behind the read-only explorer canvas. No React / React Flow, so it tests as plain TS.
 *
 * Proves: the layered layout puts a node one column right of its deepest structural
 * predecessor (longest-path, not shortest); advisory edges are dashed and don't drive
 * layout; the live overlay maps node→status; and the replay reducer reconstructs
 * status from the event log (completion outranks entry; the scrubbed node is active
 * unless completed; out-of-range indices clamp).
 *
 * @see components/admin/framework/journey-explorer/journey-mapper.ts
 */

import { describe, it, expect } from 'vitest';

import {
  layoutJourney,
  liveStatuses,
  replayStatuses,
  toFlowNodes,
} from '@/components/admin/framework/journey-explorer/journey-mapper';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type {
  JourneyEventView,
  JourneyNodeStateView,
} from '@/lib/framework/facilitation/journey/view';

type MapNode = MapDefinition['nodes'][number];
type MapEdge = MapDefinition['edges'][number];

function node(key: string, over: Partial<MapNode> = {}): MapNode {
  return { key, type: 'module', completionMode: 'once', ...over };
}
function edge(from: string, to: string, type: MapEdge['type']): MapEdge {
  return { from, to, type };
}
function evt(
  type: string,
  nodeKey: string | null,
  over: Partial<JourneyEventView> = {}
): JourneyEventView {
  return {
    id: `e-${type}-${nodeKey ?? 'none'}`,
    type,
    nodeKey,
    moduleSlug: null,
    occurredAt: '2026-06-01T10:00:00.000Z',
    ...over,
  };
}

const posByKey = (nodes: { key: string; position: { x: number; y: number } }[]) =>
  new Map(nodes.map((n) => [n.key, n.position]));

describe('layoutJourney', () => {
  it('layers nodes left-to-right along prerequisite / unlocks edges', () => {
    const structure: MapDefinition = {
      nodes: [node('a'), node('b'), node('c'), node('d')],
      edges: [
        edge('a', 'b', 'prerequisite'),
        edge('b', 'c', 'prerequisite'),
        edge('a', 'd', 'unlocks'),
      ],
    };
    const { baseNodes } = layoutJourney(structure);
    const pos = posByKey(baseNodes);
    expect(pos.get('a')?.x).toBe(0);
    expect(pos.get('b')?.x).toBe(240);
    expect(pos.get('c')?.x).toBe(480);
    expect(pos.get('d')?.x).toBe(240); // unlocks is also a forward edge
  });

  it('uses longest-path layering: a node sits right of its DEEPEST predecessor', () => {
    // a→b, a→c, b→c. c depends on both a (level 0) and b (level 1) → c must be level 2.
    const structure: MapDefinition = {
      nodes: [node('a'), node('b'), node('c')],
      edges: [
        edge('a', 'b', 'prerequisite'),
        edge('a', 'c', 'prerequisite'),
        edge('b', 'c', 'prerequisite'),
      ],
    };
    const pos = posByKey(layoutJourney(structure).baseNodes);
    expect(pos.get('c')?.x).toBe(480); // 2 * 240, not 240
  });

  it('does not let advisory (tangent / related_to) edges drive layout, and dashes them', () => {
    const structure: MapDefinition = {
      nodes: [node('a'), node('b')],
      edges: [edge('a', 'b', 'tangent')],
    };
    const { baseNodes, edges } = layoutJourney(structure);
    const pos = posByKey(baseNodes);
    // b has no *structural* predecessor → stays in column 0.
    expect(pos.get('a')?.x).toBe(0);
    expect(pos.get('b')?.x).toBe(0);
    expect(edges[0].style).toMatchObject({ strokeDasharray: '4 4' });
    expect(edges[0].label).toBe('tangent');
  });

  it('drops edges whose endpoints are missing, keeps node metadata', () => {
    const structure: MapDefinition = {
      nodes: [node('a', { moduleSlug: 'onboarding' })],
      edges: [edge('a', 'ghost', 'prerequisite')],
    };
    const { baseNodes, edges } = layoutJourney(structure);
    expect(edges).toHaveLength(0);
    expect(baseNodes[0].moduleSlug).toBe('onboarding');
  });
});

describe('liveStatuses', () => {
  it('maps each node key to its current UserNodeState status', () => {
    const states: JourneyNodeStateView[] = [
      {
        nodeKey: 'a',
        status: 'completed',
        timesCompleted: 1,
        firstEnteredAt: null,
        lastActiveAt: null,
        completedAt: null,
      },
      {
        nodeKey: 'b',
        status: 'active',
        timesCompleted: 0,
        firstEnteredAt: null,
        lastActiveAt: null,
        completedAt: null,
      },
    ];
    const map = liveStatuses(states);
    expect(map.get('a')).toBe('completed');
    expect(map.get('b')).toBe('active');
    expect(map.get('c')).toBeUndefined();
  });
});

describe('replayStatuses', () => {
  const timeline: JourneyEventView[] = [
    evt('node_entered', 'a'),
    evt('node_entered', 'b'),
    evt('node_completed', 'b'),
    evt('node_entered', 'c'),
  ];

  it('marks the scrubbed node active and prior entries visited', () => {
    const { statusByNode, currentNodeKey } = replayStatuses(timeline, 1);
    expect(currentNodeKey).toBe('b');
    expect(statusByNode.get('a')).toBe('visited');
    expect(statusByNode.get('b')).toBe('active');
    expect(statusByNode.get('c')).toBeUndefined(); // not reached yet
  });

  it('lets a completion outrank active for the scrubbed node', () => {
    const { statusByNode, currentNodeKey } = replayStatuses(timeline, 2); // complete b
    expect(currentNodeKey).toBe('b');
    expect(statusByNode.get('b')).toBe('completed');
    expect(statusByNode.get('a')).toBe('visited');
  });

  it('carries a completed node forward while a later node is active', () => {
    const { statusByNode, currentNodeKey } = replayStatuses(timeline, 3); // enter c
    expect(currentNodeKey).toBe('c');
    expect(statusByNode.get('b')).toBe('completed');
    expect(statusByNode.get('c')).toBe('active');
  });

  it('clamps an out-of-range index to the last event', () => {
    const { currentNodeKey } = replayStatuses(timeline, 99);
    expect(currentNodeKey).toBe('c');
  });

  it('returns an empty overlay and null current for an empty timeline', () => {
    const { statusByNode, currentNodeKey } = replayStatuses([], 0);
    expect(statusByNode.size).toBe(0);
    expect(currentNodeKey).toBeNull();
  });

  it('skips events with no nodeKey (non-journey engagement events)', () => {
    const mixed = [evt('session.started', null), evt('node_entered', 'a')];
    const { statusByNode, currentNodeKey } = replayStatuses(mixed, 1);
    expect(currentNodeKey).toBe('a');
    expect(statusByNode.get('a')).toBe('active');
  });
});

describe('toFlowNodes', () => {
  it('merges status + current flag, defaulting an unmapped node to unvisited', () => {
    const { baseNodes } = layoutJourney({
      nodes: [node('a'), node('b')],
      edges: [],
    });
    const nodes = toFlowNodes(baseNodes, new Map([['a', 'completed']]), 'a');
    const a = nodes.find((n) => n.id === 'a');
    const b = nodes.find((n) => n.id === 'b');
    expect(a?.data.status).toBe('completed');
    expect(a?.data.isCurrent).toBe(true);
    expect(a?.type).toBe('journey');
    expect(b?.data.status).toBe('unvisited');
    expect(b?.data.isCurrent).toBe(false);
  });
});

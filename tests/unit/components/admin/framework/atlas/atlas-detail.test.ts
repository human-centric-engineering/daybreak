/**
 * Atlas semantic-zoom detail (f-atlas t-2b) — `applyDetail` + `isSatelliteKind`.
 *
 * Pure TS. Under test: at low detail, satellite nodes and any edge touching a satellite are hidden
 * while primaries + inter-primary (`map→module`) edges stay; at full detail everything is visible;
 * inputs are never mutated and `hidden` is always set explicitly (so toggling back clears it).
 *
 * @see components/admin/framework/atlas/atlas-detail.ts
 */

import { describe, it, expect } from 'vitest';
import type { Edge } from '@xyflow/react';

import { applyDetail, isSatelliteKind } from '@/components/admin/framework/atlas/atlas-detail';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';
import type { AtlasEntityType } from '@/lib/framework/atlas/view';

const node = (id: string, kind: AtlasEntityType): AtlasFlowNode => ({
  id,
  type: 'atlas',
  position: { x: 0, y: 0 },
  data: { kind, label: id, href: null },
});

const NODES: AtlasFlowNode[] = [
  node('module:reading', 'module'),
  node('facilitation:facilitation', 'facilitation'),
  node('map:main', 'map'),
  node('agent:a1', 'agent'),
  node('slot:goal', 'slot'),
];
const EDGES: Edge[] = [
  { id: 'e1', source: 'module:reading', target: 'agent:a1' }, // touches a satellite
  { id: 'e2', source: 'map:main', target: 'module:reading' }, // primary → primary
];

describe('isSatelliteKind', () => {
  it('classifies parts as satellites and hubs as primaries', () => {
    for (const k of ['agent', 'workflow', 'slot', 'capability', 'knowledge'] as const) {
      expect(isSatelliteKind(k)).toBe(true);
    }
    for (const k of ['module', 'facilitation', 'map'] as const) {
      expect(isSatelliteKind(k)).toBe(false);
    }
  });
});

describe('applyDetail', () => {
  it('hides satellites + their edges at low detail, keeping primaries and map→module', () => {
    const { nodes, edges } = applyDetail(NODES, EDGES, false);
    const hiddenNode = (id: string) => nodes.find((n) => n.id === id)?.hidden;

    expect(hiddenNode('agent:a1')).toBe(true);
    expect(hiddenNode('slot:goal')).toBe(true);
    expect(hiddenNode('module:reading')).toBe(false);
    expect(hiddenNode('facilitation:facilitation')).toBe(false);
    expect(hiddenNode('map:main')).toBe(false);

    expect(edges.find((e) => e.id === 'e1')?.hidden).toBe(true); // module→agent hidden
    expect(edges.find((e) => e.id === 'e2')?.hidden).toBe(false); // map→module stays
  });

  it('shows everything at full detail', () => {
    const { nodes, edges } = applyDetail(NODES, EDGES, true);
    expect(nodes.every((n) => n.hidden === false)).toBe(true);
    expect(edges.every((e) => e.hidden === false)).toBe(true);
  });

  it('does not mutate its inputs', () => {
    applyDetail(NODES, EDGES, false);
    expect(NODES.every((n) => !('hidden' in n) || n.hidden === undefined)).toBe(true);
    expect(EDGES.every((e) => e.hidden === undefined)).toBe(true);
  });
});

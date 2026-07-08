/**
 * Map mappers (f-map-editor t-1) — the pure round-trip between a stored
 * `MapDefinition` and the editor's React Flow nodes/edges. No React / React Flow, so
 * it tests as plain TS.
 *
 * Proves: a node's persisted `meta._layout` drives its canvas position; an
 * unpositioned node is seeded by `layoutJourney`; `_layout` is stripped from the
 * node data payload but re-derived from `position` on save; edges round-trip their
 * type + condition; a dangling edge is dropped rather than crashing the canvas; and
 * the `flowToMapDefinition` output satisfies `mapDefinitionSchema` (the PATCH-body
 * validator).
 *
 * @see components/admin/framework/map-builder/map-mappers.ts
 */

import { describe, it, expect } from 'vitest';
import type { Edge } from '@xyflow/react';

import {
  flowToMapDefinition,
  mapDefinitionToFlow,
  type MapEdgeData,
  type MapFlowNode,
} from '@/components/admin/framework/map-builder/map-mappers';
import { stripReserved } from '@/components/admin/framework/map-builder/region-membership';
import { mapDefinitionSchema, type MapDefinition } from '@/lib/framework/facilitation/map/schema';

type DefNode = MapDefinition['nodes'][number];
type DefEdge = MapDefinition['edges'][number];

function node(key: string, over: Partial<DefNode> = {}): DefNode {
  return { key, type: 'milestone', completionMode: 'once', ...over };
}
function edge(from: string, to: string, type: DefEdge['type'] = 'prerequisite'): DefEdge {
  return { from, to, type };
}

describe('mapDefinitionToFlow', () => {
  it('uses a persisted meta._layout for a node position', () => {
    const def: MapDefinition = {
      nodes: [node('a', { meta: { _layout: { x: 300, y: 120 } } })],
      edges: [],
    };
    const { nodes } = mapDefinitionToFlow(def);
    expect(nodes[0].position).toEqual({ x: 300, y: 120 });
  });

  it('seeds an unpositioned node from layoutJourney (longest-path layering)', () => {
    const def: MapDefinition = {
      nodes: [node('a'), node('b')],
      edges: [edge('a', 'b')],
    };
    const { nodes } = mapDefinitionToFlow(def);
    const posByKey = new Map(nodes.map((n) => [n.id, n.position]));
    // `b` sits one column right of its prerequisite `a` (X_STEP = 240 in the layout).
    expect(posByKey.get('a')?.x).toBe(0);
    expect(posByKey.get('b')?.x).toBe(240);
  });

  it('carries the module binding and label, and strips _layout from data.meta', () => {
    const def: MapDefinition = {
      nodes: [
        node('m', {
          type: 'module',
          moduleSlug: 'onboarding',
          meta: { _layout: { x: 0, y: 0 }, note: 'keep me' },
        }),
      ],
      edges: [],
    };
    const { nodes } = mapDefinitionToFlow(def);
    expect(nodes[0].data.label).toBe('m');
    expect(nodes[0].data.moduleSlug).toBe('onboarding');
    expect(nodes[0].data.meta).toEqual({ note: 'keep me' });
    expect(nodes[0].data.meta?._layout).toBeUndefined();
  });

  it('round-trips an edge type + condition into edge.data', () => {
    const def: MapDefinition = {
      nodes: [node('a'), node('b')],
      edges: [
        {
          from: 'a',
          to: 'b',
          type: 'unlocks',
          condition: { family: 'state', milestone: 'a', reached: true },
        },
      ],
    };
    const { edges } = mapDefinitionToFlow(def);
    expect(edges).toHaveLength(1);
    // Flow edges carry the custom edge type so `MapEdge` renders them.
    expect(edges[0].type).toBe('map');
    expect(edges[0].data?.edgeType).toBe('unlocks');
    expect(edges[0].data?.condition).toEqual({ family: 'state', milestone: 'a', reached: true });
  });

  it('carries edge meta into edge.data', () => {
    const def: MapDefinition = {
      nodes: [node('a'), node('b')],
      edges: [{ from: 'a', to: 'b', type: 'related_to', meta: { note: 'why' } }],
    };
    const { edges } = mapDefinitionToFlow(def);
    expect(edges[0].data?.meta).toEqual({ note: 'why' });
  });

  it('drops an edge whose endpoint does not resolve', () => {
    const def: MapDefinition = {
      nodes: [node('a')],
      edges: [edge('a', 'ghost')],
    };
    const { edges } = mapDefinitionToFlow(def);
    expect(edges).toHaveLength(0);
  });
});

describe('flowToMapDefinition', () => {
  const flowNode = (
    id: string,
    over: Partial<MapFlowNode['data']> = {},
    pos = { x: 10, y: 20 }
  ): MapFlowNode => ({
    id,
    type: 'map',
    position: pos,
    data: { label: id, nodeType: 'milestone', completionMode: 'once', ...over },
  });

  it('writes the canvas position back into meta._layout', () => {
    const def = flowToMapDefinition([flowNode('a', {}, { x: 42, y: 84 })], []);
    expect(def.nodes[0].meta?._layout).toEqual({ x: 42, y: 84 });
  });

  it('produces a definition that satisfies mapDefinitionSchema (module node has a slug)', () => {
    const def = flowToMapDefinition(
      [flowNode('mod', { nodeType: 'module', moduleSlug: 'mod' })],
      []
    );
    expect(mapDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it('reconstructs edges with their type and drops edges to missing nodes', () => {
    const edges: Edge<MapEdgeData>[] = [
      { id: 'e1', source: 'a', target: 'b', data: { edgeType: 'tangent' } },
      { id: 'e2', source: 'a', target: 'gone', data: { edgeType: 'prerequisite' } },
    ];
    const def = flowToMapDefinition([flowNode('a'), flowNode('b')], edges);
    expect(def.edges).toEqual([{ from: 'a', to: 'b', type: 'tangent' }]);
  });

  it('round-trips every node field and a conditioned edge back to a valid definition', () => {
    const def: MapDefinition = {
      nodes: [
        node('gate', {
          type: 'milestone',
          stage: 'level-1',
          region: 'zone',
          onFirstArrival: { workflowSlug: 'welcome', agentSlug: 'greeter' },
        }),
        node('zone', { type: 'region' }),
        node('m', { type: 'module', moduleSlug: 'onboarding' }),
      ],
      edges: [
        {
          from: 'gate',
          to: 'm',
          type: 'unlocks',
          condition: { family: 'slot', slug: 's', op: 'gte', value: 3 },
        },
      ],
    };
    const { nodes, edges } = mapDefinitionToFlow(def);
    const back = flowToMapDefinition(nodes, edges);

    expect(mapDefinitionSchema.safeParse(back).success).toBe(true);
    const gate = back.nodes.find((n) => n.key === 'gate')!;
    expect(gate.stage).toBe('level-1');
    expect(gate.region).toBe('zone');
    expect(gate.onFirstArrival).toEqual({ workflowSlug: 'welcome', agentSlug: 'greeter' });
    expect(back.edges[0]).toEqual({
      from: 'gate',
      to: 'm',
      type: 'unlocks',
      condition: { family: 'slot', slug: 's', op: 'gte', value: 3 },
    });
  });

  it('preserves non-layout meta keys across the round-trip', () => {
    const def: MapDefinition = {
      nodes: [node('a', { meta: { note: 'hi', _layout: { x: 5, y: 5 } } })],
      edges: [],
    };
    const { nodes } = mapDefinitionToFlow(def);
    const back = flowToMapDefinition(nodes, []);
    expect(back.nodes[0].meta).toEqual({ note: 'hi', _layout: { x: 5, y: 5 } });
  });

  it('round-trips edge meta back into the definition', () => {
    const def: MapDefinition = {
      nodes: [node('a'), node('b')],
      edges: [{ from: 'a', to: 'b', type: 'tangent', meta: { note: 'keep' } }],
    };
    const { nodes, edges } = mapDefinitionToFlow(def);
    const back = flowToMapDefinition(nodes, edges);
    expect(back.edges[0]).toEqual({ from: 'a', to: 'b', type: 'tangent', meta: { note: 'keep' } });
  });
});

describe('regions (parent/child round-trip)', () => {
  const REGION_DEF: MapDefinition = {
    nodes: [
      node('zone', {
        type: 'region',
        meta: { _layout: { x: 100, y: 100 }, _size: { width: 300, height: 200 } },
      }),
      node('m', { region: 'zone', meta: { _layout: { x: 130, y: 150 } } }),
    ],
    edges: [],
  };

  it('loads a region as a sized group and its member as a parent-relative child', () => {
    const { nodes } = mapDefinitionToFlow(REGION_DEF);
    const zone = nodes.find((n) => n.id === 'zone')!;
    const m = nodes.find((n) => n.id === 'm')!;

    expect(zone.type).toBe('region');
    expect(zone.width).toBe(300);
    expect(zone.height).toBe(200);

    expect(m.parentId).toBe('zone');
    expect(m.extent).toBe('parent');
    expect(m.data.region).toBe('zone');
    // Position is relative to the region origin (130-100, 150-100).
    expect(m.position).toEqual({ x: 30, y: 50 });
  });

  it('emits the region parent before its child', () => {
    const { nodes } = mapDefinitionToFlow(REGION_DEF);
    expect(nodes.findIndex((n) => n.id === 'zone')).toBeLessThan(
      nodes.findIndex((n) => n.id === 'm')
    );
  });

  it('round-trips membership + absolute position + region size back to the definition', () => {
    const { nodes } = mapDefinitionToFlow(REGION_DEF);
    const back = flowToMapDefinition(nodes, []);
    expect(mapDefinitionSchema.safeParse(back).success).toBe(true);

    const m = back.nodes.find((n) => n.key === 'm')!;
    expect(m.region).toBe('zone');
    expect(m.meta?._layout).toEqual({ x: 130, y: 150 }); // absolute restored

    const zone = back.nodes.find((n) => n.key === 'zone')!;
    expect(zone.meta?._size).toEqual({ width: 300, height: 200 });
  });

  it('hides members of a collapsed region on load and persists the collapsed flag', () => {
    const def: MapDefinition = {
      nodes: [
        node('zone', { type: 'region', meta: { _layout: { x: 0, y: 0 }, _collapsed: true } }),
        node('m', { region: 'zone', meta: { _layout: { x: 10, y: 10 } } }),
      ],
      edges: [],
    };
    const { nodes } = mapDefinitionToFlow(def);
    expect(nodes.find((n) => n.id === 'm')?.hidden).toBe(true);
    expect(nodes.find((n) => n.id === 'zone')?.data.collapsed).toBe(true);

    const back = flowToMapDefinition(nodes, []);
    expect(back.nodes.find((n) => n.key === 'zone')?.meta?._collapsed).toBe(true);
  });

  it('treats a member whose region is not a region-type node as top-level', () => {
    const def: MapDefinition = {
      nodes: [node('a'), node('b', { region: 'a', meta: { _layout: { x: 5, y: 5 } } })],
      edges: [],
    };
    const { nodes } = mapDefinitionToFlow(def);
    // `a` is a milestone, not a region → `b` is not parented.
    expect(nodes.find((n) => n.id === 'b')?.parentId).toBeUndefined();
  });
});

describe('stripReserved', () => {
  it('removes the reserved UI keys and returns undefined when nothing is left', () => {
    expect(stripReserved({ _layout: { x: 1, y: 2 } })).toBeUndefined();
    expect(stripReserved({ _size: { width: 1, height: 2 }, _collapsed: true })).toBeUndefined();
    expect(stripReserved({ _layout: { x: 1, y: 2 }, note: 'a' })).toEqual({ note: 'a' });
    expect(stripReserved(undefined)).toBeUndefined();
    expect(stripReserved({})).toBeUndefined();
  });
});

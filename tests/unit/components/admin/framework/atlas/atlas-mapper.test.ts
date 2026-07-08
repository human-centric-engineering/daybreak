/**
 * Atlas mapper (f-atlas t-2a) — `compositionToFlow` + `atlasNodeId` + `atlasDeepLink`.
 *
 * Pure TS (the mapper's only `@xyflow/react` imports are types, erased at runtime), so this needs no
 * DOM/React Flow mock. Under test: one node per entity with the right kind/label/badge/deep-link,
 * every relationship as an edge, the `map_module` collapse + dedup (a map's places → one map→module
 * edge), dangling-edge skip, and a deterministic layout.
 *
 * @see components/admin/framework/atlas/atlas-mapper.ts
 */

import { describe, it, expect } from 'vitest';

import {
  atlasDeepLink,
  atlasNodeId,
  compositionToFlow,
} from '@/components/admin/framework/atlas/atlas-mapper';
import type { CompositionProjection } from '@/lib/framework/atlas/view';

function projection(over: Partial<CompositionProjection> = {}): CompositionProjection {
  return {
    modules: [
      {
        id: 'reading',
        name: 'Reading',
        status: 'active',
        audience: 'all',
        isRegistered: true,
        registeredInCode: true,
        description: null,
        agentRoles: [],
      },
      {
        id: 'writing',
        name: 'Writing',
        status: 'retired',
        audience: 'all',
        isRegistered: false,
        registeredInCode: false,
        description: null,
        agentRoles: [],
      },
    ],
    facilitation: { seats: [{ role: 'onboarding', agentId: 'a2' }], policies: [] },
    agents: [
      { id: 'a1', name: 'Aria', slug: 'aria', isActive: true, isTombstoned: false },
      { id: 'a2', name: 'Facil', slug: 'facil', isActive: true, isTombstoned: true },
    ],
    workflows: [{ id: 'w1', name: 'WF', slug: 'wf', isActive: true, hasPublishedVersion: false }],
    slots: [
      {
        id: 'goal',
        group: 'goals',
        scope: 'module:reading',
        visibility: 'open',
        sensitivity: 'standard',
        dataType: 'text',
        isActive: true,
      },
      {
        id: 'mood',
        group: 'wellbeing',
        scope: 'facilitation',
        visibility: 'hidden',
        sensitivity: 'special_category',
        dataType: 'text',
        isActive: true,
      },
    ],
    capabilities: [
      { id: 'get_state', kind: 'framework' },
      { id: 'reading__save', kind: 'module' },
    ],
    knowledge: [
      { id: 'document:d1', kind: 'document', name: 'Handbook', slug: 'handbook', status: 'ready' },
    ],
    maps: [
      { id: 'main', name: 'Main', version: 2, nodes: [], edges: [] },
      { id: 'draft', name: 'Draft', version: null, nodes: [], edges: [] },
    ],
    edges: [
      {
        kind: 'module_agent',
        source: { type: 'module', id: 'reading' },
        target: { type: 'agent', id: 'a1' },
        label: 'companion',
        meta: { isPrimary: true },
      },
      {
        kind: 'module_workflow',
        source: { type: 'module', id: 'reading' },
        target: { type: 'workflow', id: 'w1' },
        label: 'module.completed',
      },
      {
        kind: 'module_slot',
        source: { type: 'module', id: 'reading' },
        target: { type: 'slot', id: 'goal' },
      },
      {
        kind: 'module_capability',
        source: { type: 'module', id: 'reading' },
        target: { type: 'capability', id: 'reading__save' },
      },
      {
        kind: 'module_knowledge',
        source: { type: 'module', id: 'reading' },
        target: { type: 'knowledge', id: 'document:d1' },
      },
      {
        kind: 'facilitation_agent',
        source: { type: 'facilitation', id: 'facilitation' },
        target: { type: 'agent', id: 'a2' },
        label: 'onboarding',
      },
      {
        kind: 'facilitation_slot',
        source: { type: 'facilitation', id: 'facilitation' },
        target: { type: 'slot', id: 'mood' },
      },
      {
        kind: 'facilitation_capability',
        source: { type: 'facilitation', id: 'facilitation' },
        target: { type: 'capability', id: 'get_state' },
      },
      // Two places of `main` bind `reading` → must collapse to ONE map→module edge.
      {
        kind: 'map_module',
        source: { type: 'mapNode', id: 'main::introReading' },
        target: { type: 'module', id: 'reading' },
      },
      {
        kind: 'map_module',
        source: { type: 'mapNode', id: 'main::reviewReading' },
        target: { type: 'module', id: 'reading' },
      },
      // A dangling edge to a non-existent entity — must be skipped.
      {
        kind: 'module_agent',
        source: { type: 'module', id: 'reading' },
        target: { type: 'agent', id: 'ghost' },
      },
    ],
    ...over,
  };
}

describe('atlasNodeId + atlasDeepLink', () => {
  it('namespaces node ids by type so cross-type ids cannot collide', () => {
    expect(atlasNodeId('agent', 'x')).toBe('agent:x');
    expect(atlasNodeId('slot', 'x')).toBe('slot:x');
    expect(atlasNodeId('agent', 'x')).not.toBe(atlasNodeId('slot', 'x'));
  });

  it('resolves deep-links per type, degrading slot / facilitation / mapNode to null', () => {
    expect(atlasDeepLink('module', 'reading')).toBe('/admin/framework/modules/reading');
    expect(atlasDeepLink('map', 'main')).toBe('/admin/framework/maps/main');
    expect(atlasDeepLink('agent', 'a1')).toBe('/admin/orchestration/agents/a1');
    expect(atlasDeepLink('workflow', 'w1')).toBe('/admin/orchestration/workflows/w1');
    expect(atlasDeepLink('capability', 'get_state')).toBe('/admin/orchestration/capabilities');
    expect(atlasDeepLink('knowledge', 'document:d1')).toBe('/admin/orchestration/knowledge');
    expect(atlasDeepLink('slot', 'goal')).toBeNull();
    expect(atlasDeepLink('facilitation', 'facilitation')).toBeNull();
    expect(atlasDeepLink('mapNode', 'x')).toBeNull();
  });
});

describe('compositionToFlow — nodes', () => {
  it('builds one node per entity plus the facilitation singleton, with type-namespaced ids', () => {
    const { nodes } = compositionToFlow(projection());
    const ids = new Set(nodes.map((n) => n.id));
    // 2 modules + facilitation + 2 agents + 1 wf + 2 slots + 2 caps + 1 knowledge + 2 maps = 13
    expect(nodes).toHaveLength(13);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(13); // all unique
    expect(ids.has('module:reading')).toBe(true);
    expect(ids.has('facilitation:facilitation')).toBe(true);
    expect(ids.has('knowledge:document:d1')).toBe(true);
  });

  it('carries kind, label, deep-link href, and status badges', () => {
    const { nodes } = compositionToFlow(projection());
    const byId = new Map(nodes.map((n) => [n.id, n.data]));

    expect(byId.get('module:reading')).toMatchObject({
      kind: 'module',
      label: 'Reading',
      href: '/admin/framework/modules/reading',
    });
    expect(byId.get('module:writing')?.badge).toBe('retired');
    expect(byId.get('agent:a2')?.badge).toBe('removed'); // tombstoned
    expect(byId.get('workflow:w1')?.badge).toBe('unpublished');
    expect(byId.get('slot:mood')?.badge).toBe('special_category');
    expect(byId.get('slot:goal')?.badge).toBeUndefined(); // standard sensitivity → no badge
    expect(byId.get('map:main')?.badge).toBe('v2');
    expect(byId.get('map:draft')?.badge).toBe('unpublished'); // version null
    expect(byId.get('slot:goal')?.href).toBeNull(); // slot has no editor
  });
});

describe('compositionToFlow — edges', () => {
  it('emits an edge per relationship with type-namespaced endpoints and labels', () => {
    const { edges } = compositionToFlow(projection());
    const agentEdge = edges.find((e) => e.source === 'module:reading' && e.target === 'agent:a1');
    expect(agentEdge?.label).toBe('companion');
    expect(
      edges.find((e) => e.source === 'facilitation:facilitation' && e.target === 'slot:mood')
    ).toBeDefined();
  });

  it('keeps both edges (with unique ids) when one agent fills two roles in a module', () => {
    // ModuleAgentBinding is @@unique([moduleId, agentId, role]) — the same agent CAN hold two roles.
    const { edges } = compositionToFlow(
      projection({
        edges: [
          {
            kind: 'module_agent',
            source: { type: 'module', id: 'reading' },
            target: { type: 'agent', id: 'a1' },
            label: 'companion',
          },
          {
            kind: 'module_agent',
            source: { type: 'module', id: 'reading' },
            target: { type: 'agent', id: 'a1' },
            label: 'reviewer',
          },
        ],
      })
    );
    const roleEdges = edges.filter((e) => e.source === 'module:reading' && e.target === 'agent:a1');
    expect(roleEdges).toHaveLength(2); // both roles kept, not collapsed
    expect(new Set(roleEdges.map((e) => e.id)).size).toBe(2); // unique React Flow ids
    expect(roleEdges.map((e) => e.label).sort()).toEqual(['companion', 'reviewer']);
  });

  it('collapses a map`s places to ONE map→module edge and skips a dangling edge', () => {
    const { edges } = compositionToFlow(projection());
    // The two `main::*` places binding `reading` collapse to a single map:main→module:reading edge.
    const mapEdges = edges.filter((e) => e.source === 'map:main' && e.target === 'module:reading');
    expect(mapEdges).toHaveLength(1);
    // The dangling module_agent→ghost edge is dropped (ghost is not an entity).
    expect(edges.some((e) => e.target === 'agent:ghost')).toBe(false);
  });
});

describe('compositionToFlow — layout', () => {
  it('is deterministic and places primaries on the top row', () => {
    const a = compositionToFlow(projection());
    const b = compositionToFlow(projection());
    expect(a.nodes.map((n) => n.position)).toEqual(b.nodes.map((n) => n.position)); // no clock/random

    const readingPos = a.nodes.find((n) => n.id === 'module:reading')?.position;
    const facilPos = a.nodes.find((n) => n.id === 'facilitation:facilitation')?.position;
    expect(readingPos?.y).toBe(0); // primaries on the top row
    expect(facilPos?.y).toBe(0);
    expect(facilPos?.x).toBeGreaterThan(readingPos?.x ?? 0); // facilitation sits after the modules
    // A satellite (agent a1, owned by reading) is placed below the top row.
    expect(a.nodes.find((n) => n.id === 'agent:a1')?.position.y ?? 0).toBeGreaterThan(0);
  });

  it('parks an orphan entity (referenced by no edge) in a trailing column rather than at the origin', () => {
    // A slot owned by no module and referenced by no edge — it must still get a distinct position.
    const p = projection({
      slots: [
        {
          id: 'loner',
          group: 'g',
          scope: 'global',
          visibility: 'open',
          sensitivity: 'standard',
          dataType: 'text',
          isActive: true,
        },
      ],
      edges: [],
    });
    const { nodes } = compositionToFlow(p);
    const loner = nodes.find((n) => n.id === 'slot:loner');
    expect(loner).toBeDefined();
    // Parked to the right of every primary column (not stacked at x=0).
    expect(loner!.position.x).toBeGreaterThan(0);
  });
});

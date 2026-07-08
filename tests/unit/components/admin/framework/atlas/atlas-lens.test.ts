/**
 * Atlas cross-cutting lens (f-atlas t-3) — `focusSet` / `applyFocus` / `lensGroups`.
 *
 * Pure TS. Under test: the 1-hop focus set, the dim/focused flags + edge opacities `applyFocus`
 * writes (and the clean reset when the lens clears), and the legend-ordered grouping the selector uses.
 *
 * @see components/admin/framework/atlas/atlas-lens.ts
 */

import { describe, it, expect } from 'vitest';
import type { Edge } from '@xyflow/react';

import { applyFocus, focusSet, lensGroups } from '@/components/admin/framework/atlas/atlas-lens';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';
import type { AtlasEntityType } from '@/lib/framework/atlas/view';

const node = (id: string, kind: AtlasEntityType, label = id): AtlasFlowNode => ({
  id,
  type: 'atlas',
  position: { x: 0, y: 0 },
  data: { kind, label, href: null },
});

const NODES: AtlasFlowNode[] = [
  node('module:reading', 'module', 'Reading'),
  node('facilitation:facilitation', 'facilitation', 'Facilitation'),
  node('agent:a1', 'agent', 'Aria'),
  node('agent:a2', 'agent', 'Bo'),
  node('slot:goal', 'slot', 'goal'),
];
const EDGES: Edge[] = [
  { id: 'e1', source: 'module:reading', target: 'agent:a1' },
  { id: 'e2', source: 'module:reading', target: 'slot:goal' },
  { id: 'e3', source: 'facilitation:facilitation', target: 'agent:a2' },
];

describe('focusSet', () => {
  it('is the focused node plus its direct (1-hop) neighbours', () => {
    // a1 is bound into `reading` only → focus is {a1, reading}.
    expect(focusSet(EDGES, 'agent:a1')).toEqual(new Set(['agent:a1', 'module:reading']));
    // reading connects to a1 + goal.
    expect(focusSet(EDGES, 'module:reading')).toEqual(
      new Set(['module:reading', 'agent:a1', 'slot:goal'])
    );
  });
});

describe('applyFocus', () => {
  it('flags the subject, keeps neighbours lit, dims the rest, and fades non-subject edges', () => {
    const { nodes, edges } = applyFocus(NODES, EDGES, 'agent:a1');
    const data = (id: string) => nodes.find((n) => n.id === id)!.data;

    expect(data('agent:a1')).toMatchObject({ focused: true, dimmed: false }); // the subject
    expect(data('module:reading')).toMatchObject({ focused: false, dimmed: false }); // neighbour
    expect(data('slot:goal').dimmed).toBe(true); // 2 hops away
    expect(data('agent:a2').dimmed).toBe(true);
    expect(data('facilitation:facilitation').dimmed).toBe(true);

    const op = (id: string) => edges.find((e) => e.id === id)!.style?.opacity;
    expect(op('e1')).toBe(1); // reading→a1 touches the subject → lit
    expect(op('e2')).toBeLessThan(1); // reading→goal doesn't touch a1 → faded
    expect(op('e3')).toBeLessThan(1);
  });

  it('clears every flag/opacity when the lens is null', () => {
    const focused = applyFocus(NODES, EDGES, 'agent:a1');
    const cleared = applyFocus(focused.nodes, focused.edges, null);
    expect(cleared.nodes.every((n) => n.data.dimmed === false && n.data.focused === false)).toBe(
      true
    );
    expect(cleared.edges.every((e) => e.style?.opacity === 1)).toBe(true);
  });

  it('does not mutate its inputs', () => {
    applyFocus(NODES, EDGES, 'agent:a1');
    expect(NODES.every((n) => n.data.dimmed === undefined)).toBe(true);
  });
});

describe('lensGroups', () => {
  it('groups every node by kind in legend order, omitting empty kinds', () => {
    const groups = lensGroups(NODES);
    expect(groups.map((g) => g.kind)).toEqual(['module', 'facilitation', 'agent', 'slot']);
    const agents = groups.find((g) => g.kind === 'agent')!;
    expect(agents.items).toEqual([
      { id: 'agent:a1', label: 'Aria' },
      { id: 'agent:a2', label: 'Bo' },
    ]);
  });
});

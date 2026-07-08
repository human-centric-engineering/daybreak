/**
 * AtlasGraph (f-atlas t-2b) — the semantic-zoom layer. Tracks zoom via `useOnViewportChange` (mocked
 * to capture the handler so the test can drive it) and hands hidden-flagged nodes/edges to the canvas
 * (stubbed to expose what it received). Proves: collapsed on mount (before fitView settles), satellites
 * reveal only once a viewport change reports a zoom past the threshold, and `forceExpand` overrides.
 *
 * @see components/admin/framework/atlas/atlas-graph.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// Capture the onChange handler the component registers, so the test can simulate a viewport change.
const vp = vi.hoisted(() => ({ onChange: null as null | ((v: { zoom: number }) => void) }));
vi.mock('@xyflow/react', () => ({
  useOnViewportChange: ({ onChange }: { onChange: (v: { zoom: number }) => void }) => {
    vp.onChange = onChange;
  },
}));

// Stub the canvas: expose each node's hidden + dimmed flags as data attributes.
vi.mock('@/components/admin/framework/atlas/atlas-canvas', () => ({
  AtlasCanvas: ({
    nodes,
  }: {
    nodes: { id: string; hidden?: boolean; data: { dimmed?: boolean } }[];
  }) => (
    <div data-testid="canvas">
      {nodes.map((n) => (
        <span
          key={n.id}
          data-node={n.id}
          data-hidden={String(Boolean(n.hidden))}
          data-dimmed={String(Boolean(n.data.dimmed))}
        />
      ))}
    </div>
  ),
}));

import { AtlasGraph } from '@/components/admin/framework/atlas/atlas-graph';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';

const NODES: AtlasFlowNode[] = [
  {
    id: 'module:reading',
    type: 'atlas',
    position: { x: 0, y: 0 },
    data: { kind: 'module', label: 'R', href: null },
  },
  {
    id: 'agent:a1',
    type: 'atlas',
    position: { x: 0, y: 0 },
    data: { kind: 'agent', label: 'A', href: null },
  },
];
const attrOf = (id: string, attr: string) =>
  screen.getByText('', { selector: `[data-node="${id}"]` }).getAttribute(attr);
const hiddenOf = (id: string) => attrOf(id, 'data-hidden');
const dimmedOf = (id: string) => attrOf(id, 'data-dimmed');
const setZoom = (zoom: number) => act(() => vp.onChange?.({ zoom }));

beforeEach(() => {
  vp.onChange = null;
});

describe('AtlasGraph', () => {
  it('starts collapsed on mount (before fitView reports a zoom) — no full-detail flash', () => {
    render(
      <AtlasGraph
        nodes={NODES}
        edges={[]}
        forceExpand={false}
        focusedId={null}
        onNodeClick={vi.fn()}
      />
    );
    expect(hiddenOf('agent:a1')).toBe('true'); // satellite hidden until a real zoom arrives
    expect(hiddenOf('module:reading')).toBe('false'); // primary always visible
  });

  it('reveals satellites once a viewport change reports a zoom past the threshold', () => {
    render(
      <AtlasGraph
        nodes={NODES}
        edges={[]}
        forceExpand={false}
        focusedId={null}
        onNodeClick={vi.fn()}
      />
    );

    setZoom(0.4); // below DETAIL_ZOOM (e.g. a large atlas fit) → stays collapsed
    expect(hiddenOf('agent:a1')).toBe('true');

    setZoom(1.2); // zoomed in past the threshold → unfold
    expect(hiddenOf('agent:a1')).toBe('false');
  });

  it('forceExpand overrides a collapsed/low zoom', () => {
    render(
      <AtlasGraph
        nodes={NODES}
        edges={[]}
        forceExpand={true}
        focusedId={null}
        onNodeClick={vi.fn()}
      />
    );
    expect(hiddenOf('agent:a1')).toBe('false'); // shown despite zoom never being reported
  });

  it('a lens forces full detail and dims nodes outside the focused subgraph', () => {
    const nodes: AtlasFlowNode[] = [
      ...NODES,
      {
        id: 'agent:a2',
        type: 'atlas',
        position: { x: 0, y: 0 },
        data: { kind: 'agent', label: 'B', href: null },
      },
    ];
    const edges = [{ id: 'e1', source: 'module:reading', target: 'agent:a1' }];
    // Focus on the module, zoom never reported (would be collapsed) — the lens must force detail.
    render(
      <AtlasGraph
        nodes={nodes}
        edges={edges}
        forceExpand={false}
        focusedId="module:reading"
        onNodeClick={vi.fn()}
      />
    );
    expect(hiddenOf('agent:a1')).toBe('false'); // lens forces detail — the neighbour isn't hidden by zoom
    expect(dimmedOf('agent:a1')).toBe('false'); // in the focused subgraph
    expect(dimmedOf('agent:a2')).toBe('true'); // disconnected → dimmed
  });
});

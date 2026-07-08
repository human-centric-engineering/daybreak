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

// Stub the canvas: expose which nodes are hidden as data attributes.
vi.mock('@/components/admin/framework/atlas/atlas-canvas', () => ({
  AtlasCanvas: ({ nodes }: { nodes: { id: string; hidden?: boolean }[] }) => (
    <div data-testid="canvas">
      {nodes.map((n) => (
        <span key={n.id} data-node={n.id} data-hidden={String(Boolean(n.hidden))} />
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
const hiddenOf = (id: string) =>
  screen.getByText('', { selector: `[data-node="${id}"]` }).getAttribute('data-hidden');
const setZoom = (zoom: number) => act(() => vp.onChange?.({ zoom }));

beforeEach(() => {
  vp.onChange = null;
});

describe('AtlasGraph', () => {
  it('starts collapsed on mount (before fitView reports a zoom) — no full-detail flash', () => {
    render(<AtlasGraph nodes={NODES} edges={[]} forceExpand={false} onNodeClick={vi.fn()} />);
    expect(hiddenOf('agent:a1')).toBe('true'); // satellite hidden until a real zoom arrives
    expect(hiddenOf('module:reading')).toBe('false'); // primary always visible
  });

  it('reveals satellites once a viewport change reports a zoom past the threshold', () => {
    render(<AtlasGraph nodes={NODES} edges={[]} forceExpand={false} onNodeClick={vi.fn()} />);

    setZoom(0.4); // below DETAIL_ZOOM (e.g. a large atlas fit) → stays collapsed
    expect(hiddenOf('agent:a1')).toBe('true');

    setZoom(1.2); // zoomed in past the threshold → unfold
    expect(hiddenOf('agent:a1')).toBe('false');
  });

  it('forceExpand overrides a collapsed/low zoom', () => {
    render(<AtlasGraph nodes={NODES} edges={[]} forceExpand={true} onNodeClick={vi.fn()} />);
    expect(hiddenOf('agent:a1')).toBe('false'); // shown despite zoom never being reported
  });
});

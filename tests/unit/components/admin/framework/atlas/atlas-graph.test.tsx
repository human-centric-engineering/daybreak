/**
 * AtlasGraph (f-atlas t-2b) — the semantic-zoom layer. Reads the live zoom (`useViewport`, mocked),
 * combines it with the `forceExpand` override, and hands hidden-flagged nodes/edges to the canvas
 * (stubbed to expose what it received). Proves: below the threshold satellites hide, above it they
 * show, and `forceExpand` overrides a low zoom.
 *
 * @see components/admin/framework/atlas/atlas-graph.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const viewport = vi.hoisted(() => ({ zoom: 1 }));
vi.mock('@xyflow/react', () => ({ useViewport: () => viewport }));

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

beforeEach(() => {
  viewport.zoom = 1;
});

describe('AtlasGraph', () => {
  it('hides satellites when zoomed out below the detail threshold', () => {
    viewport.zoom = 0.4; // < DETAIL_ZOOM
    render(<AtlasGraph nodes={NODES} edges={[]} forceExpand={false} onNodeClick={vi.fn()} />);
    expect(hiddenOf('agent:a1')).toBe('true');
    expect(hiddenOf('module:reading')).toBe('false');
  });

  it('shows satellites when zoomed in past the threshold', () => {
    viewport.zoom = 1.2; // >= DETAIL_ZOOM
    render(<AtlasGraph nodes={NODES} edges={[]} forceExpand={false} onNodeClick={vi.fn()} />);
    expect(hiddenOf('agent:a1')).toBe('false');
  });

  it('forceExpand overrides a low zoom', () => {
    viewport.zoom = 0.2;
    render(<AtlasGraph nodes={NODES} edges={[]} forceExpand={true} onNodeClick={vi.fn()} />);
    expect(hiddenOf('agent:a1')).toBe('false');
  });
});

/**
 * JourneyCanvas (f-ops-views t-5b) — the read-only React Flow surface. It owns no
 * state; it just paints the nodes/edges the explorer computes. `@xyflow/react` is
 * mocked (no layout measurement in happy-dom, as the workflow-canvas test does); this
 * proves the canvas mounts and forwards its nodes.
 *
 * @see components/admin/framework/journey-explorer/journey-canvas.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, children }: { nodes: { id: string }[]; children?: ReactNode }) => (
    <div data-testid="rf" data-node-count={nodes.length}>
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Panel: ({ children }: { children?: ReactNode }) => <div data-testid="rf-panel">{children}</div>,
  MarkerType: { ArrowClosed: 'arrowclosed' },
}));
const theme = vi.hoisted(() => ({ value: 'light' }));
vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ theme: theme.value, setTheme: vi.fn() }),
}));

import { JourneyCanvas } from '@/components/admin/framework/journey-explorer/journey-canvas';
import type { JourneyFlowNode } from '@/components/admin/framework/journey-explorer/journey-mapper';

const NODES: JourneyFlowNode[] = [
  {
    id: 'a',
    type: 'journey',
    position: { x: 0, y: 0 },
    data: { label: 'a', nodeType: 'module', status: 'active', isCurrent: false },
  },
];

describe('JourneyCanvas', () => {
  it('mounts and forwards its nodes to React Flow', () => {
    theme.value = 'light';
    render(<JourneyCanvas nodes={NODES} edges={[{ id: 'a-b', source: 'a', target: 'b' }]} />);

    expect(screen.getByTestId('journey-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('rf')).toHaveAttribute('data-node-count', '1');
  });

  it('renders under the dark theme (colorMode branch)', () => {
    theme.value = 'dark';
    render(<JourneyCanvas nodes={NODES} edges={[]} />);
    expect(screen.getByTestId('journey-canvas')).toBeInTheDocument();
  });

  it('renders no overlay panel by default (the explorer case is unchanged)', () => {
    theme.value = 'light';
    render(<JourneyCanvas nodes={NODES} edges={[]} />);
    expect(screen.queryByTestId('rf-panel')).not.toBeInTheDocument();
  });

  it('mounts an overlay in a panel when one is provided (the heat host hook)', () => {
    theme.value = 'light';
    render(<JourneyCanvas nodes={NODES} edges={[]} overlay={<span>legend</span>} />);
    const panel = screen.getByTestId('rf-panel');
    expect(panel).toHaveTextContent('legend');
  });
});

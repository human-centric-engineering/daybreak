/**
 * AtlasCanvas (f-atlas t-2a) — the read-only React Flow surface. It owns no state; it paints the
 * nodes/edges the view computes and forwards a node click up. `@xyflow/react` is mocked (no layout
 * measurement in happy-dom, as the journey/map canvas tests do); the mock renders a button per node
 * so the click-forwarding can be exercised.
 *
 * @see components/admin/framework/atlas/atlas-canvas.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    onNodeClick,
    children,
  }: {
    nodes: { id: string }[];
    onNodeClick: (e: unknown, n: { id: string }) => void;
    children?: ReactNode;
  }) => (
    <div data-testid="rf" data-node-count={nodes.length}>
      {nodes.map((n) => (
        <button key={n.id} onClick={() => onNodeClick({}, n)}>
          {n.id}
        </button>
      ))}
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
}));
const theme = vi.hoisted(() => ({ value: 'light' }));
vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ theme: theme.value, setTheme: vi.fn() }),
}));

import { AtlasCanvas } from '@/components/admin/framework/atlas/atlas-canvas';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';

const NODES: AtlasFlowNode[] = [
  {
    id: 'module:reading',
    type: 'atlas',
    position: { x: 0, y: 0 },
    data: { kind: 'module', label: 'Reading', href: '/x' },
  },
];

describe('AtlasCanvas', () => {
  it('mounts and forwards its node count', () => {
    render(<AtlasCanvas nodes={NODES} edges={[]} onNodeClick={vi.fn()} />);
    expect(screen.getByTestId('rf')).toHaveAttribute('data-node-count', '1');
  });

  it('forwards a clicked node to onNodeClick', async () => {
    const onNodeClick = vi.fn();
    render(<AtlasCanvas nodes={NODES} edges={[]} onNodeClick={onNodeClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'module:reading' }));
    expect(onNodeClick).toHaveBeenCalledWith(NODES[0]);
  });

  it('mounts in dark mode', () => {
    theme.value = 'dark';
    render(<AtlasCanvas nodes={NODES} edges={[]} onNodeClick={vi.fn()} />);
    expect(screen.getByTestId('rf')).toBeInTheDocument();
    theme.value = 'light';
  });
});

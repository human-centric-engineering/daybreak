/**
 * MapCanvas (f-map-editor t-1) — the editable React Flow surface. `@xyflow/react` is
 * mocked (no layout measurement in happy-dom); this proves the drop handler
 * materialises a node from a valid palette payload, rejects an unknown type, and
 * shows the empty-canvas hint.
 *
 * @see components/admin/framework/map-builder/map-canvas.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    onNodeClick,
    onPaneClick,
    children,
  }: {
    nodes: { id: string }[];
    onNodeClick?: (e: unknown, node: { id: string }) => void;
    onPaneClick?: () => void;
    children?: ReactNode;
  }) => (
    <div data-testid="rf" data-node-count={nodes.length}>
      <button data-testid="rf-click-node" onClick={(e) => onNodeClick?.(e, { id: 'x' })} />
      <button data-testid="rf-click-pane" onClick={() => onPaneClick?.()} />
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  // Return a fixed canvas-space point so the test doesn't depend on happy-dom
  // wiring pointer coords onto the synthetic drop event.
  useReactFlow: () => ({ screenToFlowPosition: () => ({ x: 99, y: 88 }) }),
}));
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

import { MapCanvas } from '@/components/admin/framework/map-builder/map-canvas';

function dropPayload(type: string) {
  return { dataTransfer: { getData: () => type, dropEffect: '' } };
}

describe('MapCanvas', () => {
  it('shows the empty-canvas hint when there are no nodes', () => {
    render(
      <MapCanvas
        nodes={[]}
        edges={[]}
        onNodesChange={vi.fn()}
        onNodeClick={vi.fn()}
        onNodeAdd={vi.fn()}
      />
    );
    expect(screen.getByText(/Empty map/)).toBeInTheDocument();
  });

  it('hides the empty hint once a node is present', () => {
    const node = {
      id: 'a',
      type: 'map' as const,
      position: { x: 0, y: 0 },
      data: { label: 'a', nodeType: 'stage' as const, completionMode: 'once' as const },
    };
    render(
      <MapCanvas
        nodes={[node]}
        edges={[]}
        onNodesChange={vi.fn()}
        onNodeClick={vi.fn()}
        onNodeAdd={vi.fn()}
      />
    );
    expect(screen.queryByText(/Empty map/)).not.toBeInTheDocument();
    expect(screen.getByTestId('rf')).toHaveAttribute('data-node-count', '1');
  });

  it('adds a node when a valid palette type is dropped', () => {
    const onNodeAdd = vi.fn();
    render(
      <MapCanvas
        nodes={[]}
        edges={[]}
        onNodesChange={vi.fn()}
        onNodeClick={vi.fn()}
        onNodeAdd={onNodeAdd}
      />
    );
    const surface = screen.getByTestId('map-canvas');
    fireEvent.dragOver(surface, dropPayload('module'));
    fireEvent.drop(surface, { ...dropPayload('module'), clientX: 20, clientY: 30 });

    expect(onNodeAdd).toHaveBeenCalledTimes(1);
    const node = onNodeAdd.mock.calls[0][0];
    expect(node.data.nodeType).toBe('module');
    expect(node.position).toEqual({ x: 99, y: 88 });
  });

  it('forwards node selection and pane deselection', () => {
    const onNodeClick = vi.fn();
    render(
      <MapCanvas
        nodes={[]}
        edges={[]}
        onNodesChange={vi.fn()}
        onNodeClick={onNodeClick}
        onNodeAdd={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('rf-click-node'));
    expect(onNodeClick).toHaveBeenLastCalledWith('x');
    fireEvent.click(screen.getByTestId('rf-click-pane'));
    expect(onNodeClick).toHaveBeenLastCalledWith(null);
  });

  it('ignores a drop of an unknown type', () => {
    const onNodeAdd = vi.fn();
    render(
      <MapCanvas
        nodes={[]}
        edges={[]}
        onNodesChange={vi.fn()}
        onNodeClick={vi.fn()}
        onNodeAdd={onNodeAdd}
      />
    );
    fireEvent.drop(screen.getByTestId('map-canvas'), {
      ...dropPayload('agent_call'),
      clientX: 0,
      clientY: 0,
    });
    expect(onNodeAdd).not.toHaveBeenCalled();
  });
});

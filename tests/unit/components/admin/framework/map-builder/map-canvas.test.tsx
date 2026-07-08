/**
 * MapCanvas (f-map-editor t-1/t-2) — the editable React Flow surface. `@xyflow/react`
 * is mocked (no layout measurement in happy-dom); this proves the drop handler
 * materialises a node from a valid palette payload, rejects an unknown type, shows
 * the empty-canvas hint, and forwards node/edge selection.
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
    onEdgeClick,
    onPaneClick,
    children,
  }: {
    nodes: { id: string }[];
    onNodeClick?: (e: unknown, node: { id: string }) => void;
    onEdgeClick?: (e: unknown, edge: { id: string }) => void;
    onPaneClick?: () => void;
    children?: ReactNode;
  }) => (
    <div data-testid="rf" data-node-count={nodes.length}>
      <button data-testid="rf-click-node" onClick={(e) => onNodeClick?.(e, { id: 'x' })} />
      <button data-testid="rf-click-edge" onClick={(e) => onEdgeClick?.(e, { id: 'e1' })} />
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
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

function dropPayload(type: string) {
  return { dataTransfer: { getData: () => type, dropEffect: '' } };
}

function renderCanvas(over: Partial<React.ComponentProps<typeof MapCanvas>> = {}) {
  const props: React.ComponentProps<typeof MapCanvas> = {
    nodes: [],
    edges: [],
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onConnect: vi.fn(),
    onNodeClick: vi.fn(),
    onEdgeClick: vi.fn(),
    onNodeAdd: vi.fn(),
    ...over,
  };
  return { props, ...render(<MapCanvas {...props} />) };
}

const NODE: MapFlowNode = {
  id: 'a',
  type: 'map',
  position: { x: 0, y: 0 },
  data: { label: 'a', nodeType: 'stage', completionMode: 'once' },
};

describe('MapCanvas', () => {
  it('shows the empty-canvas hint when there are no nodes', () => {
    renderCanvas();
    expect(screen.getByText(/Empty map/)).toBeInTheDocument();
  });

  it('hides the empty hint once a node is present', () => {
    renderCanvas({ nodes: [NODE] });
    expect(screen.queryByText(/Empty map/)).not.toBeInTheDocument();
    expect(screen.getByTestId('rf')).toHaveAttribute('data-node-count', '1');
  });

  it('adds a node when a valid palette type is dropped', () => {
    const onNodeAdd = vi.fn();
    renderCanvas({ onNodeAdd });
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
    renderCanvas({ onNodeClick });
    fireEvent.click(screen.getByTestId('rf-click-node'));
    expect(onNodeClick).toHaveBeenLastCalledWith('x');
    fireEvent.click(screen.getByTestId('rf-click-pane'));
    expect(onNodeClick).toHaveBeenLastCalledWith(null);
  });

  it('forwards edge selection', () => {
    const onEdgeClick = vi.fn();
    renderCanvas({ onEdgeClick });
    fireEvent.click(screen.getByTestId('rf-click-edge'));
    expect(onEdgeClick).toHaveBeenCalledWith('e1');
  });

  it('ignores a drop of an unknown type', () => {
    const onNodeAdd = vi.fn();
    renderCanvas({ onNodeAdd });
    fireEvent.drop(screen.getByTestId('map-canvas'), {
      ...dropPayload('agent_call'),
      clientX: 0,
      clientY: 0,
    });
    expect(onNodeAdd).not.toHaveBeenCalled();
  });
});

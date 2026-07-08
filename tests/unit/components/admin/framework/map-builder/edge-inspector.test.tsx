/**
 * EdgeInspector (f-map-editor t-2) — the selected-edge panel. Proves it shows the
 * connection, marks the current type, changes the type on click, surfaces a present
 * condition read-only, and deletes the edge.
 *
 * @see components/admin/framework/map-builder/edge-inspector.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EdgeInspector } from '@/components/admin/framework/map-builder/edge-inspector';
import type {
  MapEdgeData,
  MapFlowEdge,
} from '@/components/admin/framework/map-builder/map-mappers';

function edge(data: Partial<MapEdgeData> = {}): MapFlowEdge {
  return {
    id: 'e1',
    source: 'a',
    target: 'b',
    type: 'map',
    data: { edgeType: 'prerequisite', ...data },
  };
}

describe('EdgeInspector', () => {
  it('shows the connection and marks the current type', () => {
    render(
      <EdgeInspector
        edge={edge({ edgeType: 'tangent' })}
        onTypeChange={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByTestId('edge-type-tangent')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('edge-type-prerequisite')).toHaveAttribute('aria-checked', 'false');
  });

  it('changes the type on click', async () => {
    const onTypeChange = vi.fn();
    const user = userEvent.setup();
    render(<EdgeInspector edge={edge()} onTypeChange={onTypeChange} onDelete={vi.fn()} />);
    await user.click(screen.getByTestId('edge-type-related_to'));
    expect(onTypeChange).toHaveBeenCalledWith('e1', 'related_to');
  });

  it('surfaces a present condition read-only', () => {
    render(
      <EdgeInspector
        edge={edge({ condition: { family: 'state', milestone: 'a', reached: true } })}
        onTypeChange={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/carries a gating condition/i)).toBeInTheDocument();
  });

  it('does not show the condition note for an unconditioned edge', () => {
    render(<EdgeInspector edge={edge()} onTypeChange={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText(/carries a gating condition/i)).not.toBeInTheDocument();
  });

  it('deletes the edge', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<EdgeInspector edge={edge()} onTypeChange={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: /Delete edge/ }));
    expect(onDelete).toHaveBeenCalledWith('e1');
  });
});

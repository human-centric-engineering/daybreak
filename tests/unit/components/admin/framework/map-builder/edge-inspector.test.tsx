/**
 * EdgeInspector (f-map-editor t-2 / t-3) — the selected-edge panel. Proves it shows the
 * connection, marks the current type, changes the type on click, deletes the edge, and
 * (t-3) mounts the condition builder seeded from the edge's condition.
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

function renderInspector(props: Partial<React.ComponentProps<typeof EdgeInspector>> = {}) {
  return render(
    <EdgeInspector
      edge={edge()}
      nodeKeys={['a', 'b']}
      slotOptions={['mood']}
      onTypeChange={vi.fn()}
      onConditionChange={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />
  );
}

describe('EdgeInspector', () => {
  it('shows the connection and marks the current type', () => {
    renderInspector({ edge: edge({ edgeType: 'tangent' }) });
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByTestId('edge-type-tangent')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('edge-type-prerequisite')).toHaveAttribute('aria-checked', 'false');
  });

  it('changes the type on click', async () => {
    const onTypeChange = vi.fn();
    const user = userEvent.setup();
    renderInspector({ onTypeChange });
    await user.click(screen.getByTestId('edge-type-related_to'));
    expect(onTypeChange).toHaveBeenCalledWith('e1', 'related_to');
  });

  it('mounts the condition builder seeded from a present condition', () => {
    renderInspector({
      edge: edge({ condition: { family: 'state', milestone: 'a', reached: true } }),
    });
    expect(screen.getByTestId('condition-family')).toHaveValue('state');
    expect(screen.getByTestId('condition-milestone')).toHaveValue('a');
  });

  it('defaults the condition builder to "none" for an unconditioned edge', () => {
    renderInspector();
    expect(screen.getByTestId('condition-family')).toHaveValue('none');
  });

  it('deletes the edge', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderInspector({ onDelete });
    await user.click(screen.getByRole('button', { name: /Delete edge/ }));
    expect(onDelete).toHaveBeenCalledWith('e1');
  });
});

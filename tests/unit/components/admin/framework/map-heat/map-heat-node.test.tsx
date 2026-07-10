/**
 * MapHeatNode (f-engagement-analytics t-1b) — the read-only heat canvas node.
 * Presentational: colours by the active metric's bucket, shows the collective figures,
 * and a drop-off badge only when there is drop-off. React Flow's `Handle`/`Position`
 * are mocked (no canvas context in happy-dom).
 *
 * @see components/admin/framework/map-heat/map-heat-node.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

import { MapHeatNode } from '@/components/admin/framework/map-heat/map-heat-node';
import type {
  MapHeatNodeData,
  MapHeatNodeProps,
} from '@/components/admin/framework/map-heat/map-heat-mapper';

function renderNode(over: Partial<MapHeatNodeData> = {}) {
  const data: MapHeatNodeData = {
    label: 'welcome',
    nodeType: 'module',
    bucket: 3,
    metric: 'traffic',
    heat: {
      distinctUsers: 12,
      entries: 20,
      completions: 9,
      enteredUsers: 12,
      completedUsers: 9,
      dropOff: 3,
    },
    ...over,
  };
  return render(<MapHeatNode {...({ data } as unknown as MapHeatNodeProps)} />);
}

describe('MapHeatNode', () => {
  it('renders the key, figures, and tags its bucket', () => {
    renderNode();
    const el = screen.getByTestId('map-heat-node');
    expect(el).toHaveAttribute('data-bucket', '3');
    expect(screen.getByText('welcome')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // distinct users
    expect(screen.getByText('20')).toBeInTheDocument(); // entries
    expect(screen.getByText('9')).toBeInTheDocument(); // completions
  });

  it('shows a bound module slug when the node has one', () => {
    renderNode({ moduleSlug: 'onboarding-mod' });
    expect(screen.getByText('onboarding-mod')).toBeInTheDocument();
  });

  it('colours by the active metric ramp', () => {
    expect(renderNode({ bucket: 4, metric: 'traffic' }).container.innerHTML).toContain('sky');
  });

  it('re-colours to the drop-off ramp when the metric is drop-off', () => {
    expect(renderNode({ bucket: 4, metric: 'dropoff' }).container.innerHTML).toContain('rose');
  });

  it('shows a drop-off badge only when there is drop-off', () => {
    renderNode({ heat: { ...zero(), enteredUsers: 5, dropOff: 5 } });
    expect(screen.getByText(/5 dropped/)).toBeInTheDocument();
  });

  it('omits the drop-off badge at zero drop-off', () => {
    renderNode({ heat: { ...zero(), distinctUsers: 4, entries: 4, dropOff: 0 } });
    expect(screen.queryByText(/dropped/)).not.toBeInTheDocument();
  });

  it('renders bucket 0 (cold node) with the neutral treatment, no crash', () => {
    const { container } = renderNode({ bucket: 0, heat: zero() });
    expect(screen.getByTestId('map-heat-node')).toHaveAttribute('data-bucket', '0');
    expect(container.innerHTML).toContain('bg-background');
  });
});

function zero() {
  return {
    distinctUsers: 0,
    entries: 0,
    completions: 0,
    enteredUsers: 0,
    completedUsers: 0,
    dropOff: 0,
  };
}

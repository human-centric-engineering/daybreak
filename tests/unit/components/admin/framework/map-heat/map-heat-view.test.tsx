/**
 * MapHeatView (f-engagement-analytics t-1b) — the client shell. `JourneyCanvas` is
 * mocked to isolate the view's fold + metric toggle from canvas internals. Proves: it
 * renders the canvas with heat nodes + the legend/toggle overlay, switching the metric
 * re-folds (the canvas sees the new metric), and a null structure degrades to a notice.
 *
 * @see components/admin/framework/map-heat/map-heat-view.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MapHeatFlowNode } from '@/components/admin/framework/map-heat/map-heat-mapper';

vi.mock('@/components/admin/framework/journey-explorer/journey-canvas', () => ({
  JourneyCanvas: ({ nodes, overlay }: { nodes: MapHeatFlowNode[]; overlay?: ReactNode }) => (
    <div data-testid="canvas" data-metric={nodes[0]?.data.metric} data-nodes={nodes.length}>
      {overlay}
    </div>
  ),
}));

import { MapHeatView } from '@/components/admin/framework/map-heat/map-heat-view';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type { MapHeat } from '@/lib/framework/engagement/map-heat';

const STRUCTURE: MapDefinition = {
  nodes: [
    { key: 'a', type: 'module', completionMode: 'once' },
    { key: 'b', type: 'module', completionMode: 'once' },
  ],
  edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
};

const HEAT: MapHeat = {
  graphSlug: 'onboarding',
  nodes: [
    {
      nodeKey: 'a',
      distinctUsers: 10,
      entries: 12,
      completions: 8,
      enteredUsers: 10,
      completedUsers: 8,
      dropOff: 2,
    },
  ],
};

describe('MapHeatView', () => {
  it('renders the canvas with a node per structural node and the traffic metric by default', () => {
    render(
      <MapHeatView
        graphName="Onboarding"
        graphSlug="onboarding"
        structure={STRUCTURE}
        heat={HEAT}
      />
    );
    const canvas = screen.getByTestId('canvas');
    expect(canvas).toHaveAttribute('data-nodes', '2');
    expect(canvas).toHaveAttribute('data-metric', 'traffic');
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  it('re-folds to the drop-off metric when toggled', async () => {
    const user = userEvent.setup();
    render(
      <MapHeatView
        graphName="Onboarding"
        graphSlug="onboarding"
        structure={STRUCTURE}
        heat={HEAT}
      />
    );
    await user.click(screen.getByRole('button', { name: /drop-off/i }));
    expect(screen.getByTestId('canvas')).toHaveAttribute('data-metric', 'dropoff');
  });

  it('degrades to a notice (not a canvas) when there is no published structure', () => {
    render(
      <MapHeatView graphName="Onboarding" graphSlug="onboarding" structure={null} heat={HEAT} />
    );
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/no published version/i);
  });
});

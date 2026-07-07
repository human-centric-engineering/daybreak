/**
 * JourneyNode (f-ops-views t-5b) — the read-only canvas node. Presentational: colours
 * by journey status, rings the current replay node, shows a bound module slug. React
 * Flow's `Handle`/`Position` are mocked (no canvas context in happy-dom).
 *
 * @see components/admin/framework/journey-explorer/journey-node.tsx
 */

import type { NodeProps } from '@xyflow/react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

import { JourneyNode } from '@/components/admin/framework/journey-explorer/journey-node';
import type {
  JourneyFlowNode,
  JourneyNodeData,
} from '@/components/admin/framework/journey-explorer/journey-mapper';

function renderNode(data: Partial<JourneyNodeData>) {
  const full: JourneyNodeData = {
    label: 'node-a',
    nodeType: 'module',
    status: 'unvisited',
    isCurrent: false,
    ...data,
  };
  return render(<JourneyNode {...({ data: full } as unknown as NodeProps<JourneyFlowNode>)} />);
}

describe('JourneyNode', () => {
  it('renders the key, type and status, tagging the status on the element', () => {
    renderNode({ label: 'welcome', nodeType: 'stage', status: 'completed' });
    const el = screen.getByTestId('journey-node');
    expect(el).toHaveAttribute('data-status', 'completed');
    expect(screen.getByText('welcome')).toBeInTheDocument();
    expect(screen.getByText('stage')).toBeInTheDocument();
    expect(el.className).toContain('green'); // completed → green treatment
  });

  it('shows a module slug only when the node has one', () => {
    const { rerender } = renderNode({ moduleSlug: 'onboarding' });
    expect(screen.getByText('onboarding')).toBeInTheDocument();

    rerender(
      <JourneyNode
        {...({
          data: { label: 'x', nodeType: 'milestone', status: 'unvisited', isCurrent: false },
        } as unknown as NodeProps<JourneyFlowNode>)}
      />
    );
    expect(screen.queryByText('onboarding')).not.toBeInTheDocument();
  });

  it('rings the current replay node', () => {
    renderNode({ isCurrent: true });
    expect(screen.getByTestId('journey-node').className).toContain('ring');
  });

  it('falls back to the neutral treatment for an unknown status (X1)', () => {
    renderNode({ status: 'some_future_status' });
    const el = screen.getByTestId('journey-node');
    expect(el).toHaveAttribute('data-status', 'some_future_status');
    // Unknown status → the unvisited fallback (bg-background), no crash.
    expect(el.className).toContain('bg-background');
  });
});

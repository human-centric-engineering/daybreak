/**
 * JourneyExplorer (f-ops-views t-5b) — the detail view: a read-only map canvas
 * coloured by journey status, in Live or Replay mode.
 *
 * `@xyflow/react` is mocked (it needs real layout measurement happy-dom lacks — the
 * workflow-canvas test does the same); the mock renders each node's id + status so we
 * can assert the overlay. Covers: the header, the Live overlay (from node states),
 * switching to Replay + stepping the scrubber (status + current-event readout update),
 * and the degrade states (no structure ⇒ notice; empty timeline ⇒ Replay disabled).
 *
 * @see components/admin/framework/journey-explorer/journey-explorer.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Defined inside the factory (vi.mock is hoisted above module scope, so it can't
// close over a top-level const). The mock renders each node's id + status so the
// overlay is assertable without React Flow's real layout measurement.
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    children,
  }: {
    nodes: { id: string; data: { status: string; isCurrent: boolean } }[];
    children?: ReactNode;
  }) => (
    <div data-testid="rf">
      {nodes.map((n) => (
        <div
          key={n.id}
          data-testid="rf-node"
          data-id={n.id}
          data-status={n.data.status}
          data-current={n.data.isCurrent}
        />
      ))}
      {children}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

import { JourneyExplorer } from '@/components/admin/framework/journey-explorer/journey-explorer';
import type { JourneyDetailView } from '@/lib/framework/facilitation/journey/view';

const nodeEl = (id: string) => document.querySelector(`[data-testid="rf-node"][data-id="${id}"]`);

function makeDetail(over: Partial<JourneyDetailView> = {}): JourneyDetailView {
  return {
    journey: {
      id: 'j1',
      userId: 'user_alice',
      graphSlug: 'main-map',
      contextKey: '',
      startedAt: '2026-06-01T10:00:00.000Z',
    },
    graph: {
      name: 'Main Map',
      slug: 'main-map',
      structure: {
        nodes: [
          { key: 'a', type: 'module', completionMode: 'once' },
          { key: 'b', type: 'module', completionMode: 'once' },
        ],
        edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
      },
    },
    nodeStates: [
      {
        nodeKey: 'a',
        status: 'completed',
        timesCompleted: 1,
        firstEnteredAt: null,
        lastActiveAt: null,
        completedAt: null,
      },
      {
        nodeKey: 'b',
        status: 'active',
        timesCompleted: 0,
        firstEnteredAt: null,
        lastActiveAt: null,
        completedAt: null,
      },
    ],
    timeline: [
      {
        id: 'e1',
        type: 'node_entered',
        nodeKey: 'a',
        moduleSlug: null,
        occurredAt: '2026-06-01T10:01:00.000Z',
      },
      {
        id: 'e2',
        type: 'node_entered',
        nodeKey: 'b',
        moduleSlug: null,
        occurredAt: '2026-06-01T10:02:00.000Z',
      },
    ],
    ...over,
  };
}

describe('JourneyExplorer', () => {
  it('renders the header identity and the live status overlay by default', () => {
    render(<JourneyExplorer detail={makeDetail()} />);

    expect(screen.getByRole('heading', { name: 'Main Map' })).toBeInTheDocument();
    expect(screen.getByText('user_alice')).toBeInTheDocument();
    // Live mode: nodes coloured by the current UserNodeState projection.
    expect(nodeEl('a')?.getAttribute('data-status')).toBe('completed');
    expect(nodeEl('b')?.getAttribute('data-status')).toBe('active');
  });

  it('switches to Replay and reconstructs status from the event log as the scrubber moves', async () => {
    const user = userEvent.setup();
    render(<JourneyExplorer detail={makeDetail()} />);

    await user.click(screen.getByRole('button', { name: 'Replay' }));
    // Default scrubber = last event (enter b): a visited, b active + current.
    expect(nodeEl('a')?.getAttribute('data-status')).toBe('visited');
    expect(nodeEl('b')?.getAttribute('data-status')).toBe('active');
    expect(nodeEl('b')?.getAttribute('data-current')).toBe('true');
    expect(screen.getByText(/Event 2 of 2:/)).toBeInTheDocument();

    // Step back to the first event (enter a): a active + current, b not yet reached.
    await user.click(screen.getByRole('button', { name: 'Prev' }));
    expect(nodeEl('a')?.getAttribute('data-status')).toBe('active');
    expect(nodeEl('a')?.getAttribute('data-current')).toBe('true');
    expect(nodeEl('b')?.getAttribute('data-status')).toBe('unvisited');
    expect(screen.getByText(/Event 1 of 2:/)).toBeInTheDocument();

    // Step forward again with Next.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Event 2 of 2:/)).toBeInTheDocument();

    // The range scrubber drives the same index.
    fireEvent.change(screen.getByLabelText('Replay position'), { target: { value: '0' } });
    expect(screen.getByText(/Event 1 of 2:/)).toBeInTheDocument();
  });

  it('shows the context badge and a no-activity note for an untouched journey', () => {
    render(
      <JourneyExplorer
        detail={makeDetail({
          journey: {
            id: 'j1',
            userId: 'user_alice',
            graphSlug: 'main-map',
            contextKey: 'cohort-7',
            startedAt: '2026-06-01T10:00:00.000Z',
          },
          nodeStates: [],
          timeline: [],
        })}
      />
    );
    expect(screen.getByText('context: cohort-7')).toBeInTheDocument();
    expect(screen.getByText(/No recorded activity on this journey yet/i)).toBeInTheDocument();
  });

  it('shows a notice instead of a fake canvas when the map has no published structure', () => {
    render(
      <JourneyExplorer detail={makeDetail({ graph: { name: 'X', slug: 'x', structure: null } })} />
    );
    expect(screen.queryByTestId('journey-canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/no published version/i);
  });

  it('disables Replay when the timeline is empty', () => {
    render(<JourneyExplorer detail={makeDetail({ timeline: [] })} />);
    expect(screen.getByRole('button', { name: 'Replay' })).toBeDisabled();
  });
});

/**
 * AtlasView (f-atlas t-2a) — the client shell. Runs the real mapper over the projection, renders the
 * legend + canvas, and deep-links on node click. `next/navigation`'s router + the canvas are mocked
 * so the click→navigate wiring is exercised without React Flow; the mapper is REAL (its own layout is
 * proven in `atlas-mapper.test.ts`).
 *
 * @see components/admin/framework/atlas/atlas-view.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Stub the canvas: render a button per node that forwards it to onNodeClick.
vi.mock('@/components/admin/framework/atlas/atlas-canvas', () => ({
  AtlasCanvas: ({
    nodes,
    onNodeClick,
  }: {
    nodes: { id: string }[];
    onNodeClick: (n: unknown) => void;
  }) => (
    <div>
      {nodes.map((n) => (
        <button key={n.id} onClick={() => onNodeClick(n)}>
          {n.id}
        </button>
      ))}
    </div>
  ),
}));

import { AtlasView } from '@/components/admin/framework/atlas/atlas-view';
import type { CompositionProjection } from '@/lib/framework/atlas/view';

const PROJECTION: CompositionProjection = {
  modules: [
    {
      id: 'reading',
      name: 'Reading',
      status: 'active',
      audience: 'all',
      isRegistered: true,
      registeredInCode: true,
      description: null,
      agentRoles: [],
    },
  ],
  facilitation: { seats: [], policies: [] },
  agents: [],
  workflows: [],
  slots: [
    {
      id: 'goal',
      group: 'g',
      scope: 'module:reading',
      visibility: 'open',
      sensitivity: 'standard',
      dataType: 'text',
      isActive: true,
    },
  ],
  capabilities: [],
  knowledge: [],
  maps: [],
  edges: [
    {
      kind: 'module_slot',
      source: { type: 'module', id: 'reading' },
      target: { type: 'slot', id: 'goal' },
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('AtlasView', () => {
  it('renders the legend', () => {
    render(<AtlasView projection={PROJECTION} />);
    expect(screen.getByLabelText('Node kinds')).toBeInTheDocument();
    expect(screen.getByText('Module')).toBeInTheDocument();
  });

  it('deep-links a node with an href and ignores a node without one', async () => {
    render(<AtlasView projection={PROJECTION} />);

    await userEvent.click(screen.getByRole('button', { name: 'module:reading' }));
    expect(push).toHaveBeenCalledWith('/admin/framework/modules/reading');

    push.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'slot:goal' })); // slot → href null
    expect(push).not.toHaveBeenCalled();
  });
});

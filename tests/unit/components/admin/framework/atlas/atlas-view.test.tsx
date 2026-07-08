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
const lastForceExpand = vi.hoisted(() => ({ value: null as boolean | null }));
const lastFocusedId = vi.hoisted(() => ({ value: undefined as string | null | undefined }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Stub the graph layer: record the forceExpand + focusedId it received, and render a button per node
// forwarding it to onNodeClick (so the deep-link wiring is exercised without React Flow).
vi.mock('@/components/admin/framework/atlas/atlas-graph', () => ({
  AtlasGraph: ({
    nodes,
    forceExpand,
    focusedId,
    onNodeClick,
  }: {
    nodes: { id: string }[];
    forceExpand: boolean;
    focusedId: string | null;
    onNodeClick: (n: unknown) => void;
  }) => {
    lastForceExpand.value = forceExpand;
    lastFocusedId.value = focusedId;
    return (
      <div>
        {nodes.map((n) => (
          <button key={n.id} onClick={() => onNodeClick(n)}>
            {n.id}
          </button>
        ))}
      </div>
    );
  },
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

  it('toggles "Show all detail" → forceExpand for the graph', async () => {
    render(<AtlasView projection={PROJECTION} />);
    expect(lastForceExpand.value).toBe(false); // default: auto (zoom-driven)

    await userEvent.click(screen.getByRole('button', { name: /show all detail/i }));
    expect(lastForceExpand.value).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /auto/i }));
    expect(lastForceExpand.value).toBe(false);
  });

  it('focuses an entity via the lens selector and clears it', async () => {
    render(<AtlasView projection={PROJECTION} />);
    expect(lastFocusedId.value).toBeNull(); // no lens by default

    await userEvent.click(screen.getByRole('combobox', { name: /lens/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Reading' }));
    expect(lastFocusedId.value).toBe('module:reading'); // lens now on the module

    await userEvent.click(screen.getByRole('button', { name: /clear lens/i }));
    expect(lastFocusedId.value).toBeNull();
  });
});

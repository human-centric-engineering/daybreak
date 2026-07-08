/**
 * MapBuilder (f-map-editor t-1) — the editor shell's behavioural contract. React Flow
 * is mocked (no layout measurement in happy-dom) with a stateful `useNodesState` /
 * `useEdgesState` so the canvas state the shell owns behaves for real; the mocked
 * `ReactFlow` renders one button per node so a click can select it.
 *
 * Proves: the header reflects the map's identity + publish status; Save PATCHes the
 * canvas as `{ definition }` (a schema-valid map with the seeded node); Discard is
 * gated on there being a draft and PATCHes `{ definition: null }` then reloads; and
 * deleting the selected node drops it (and its edges) from the canvas.
 *
 * @see components/admin/framework/map-builder/map-builder.tsx
 */

import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const api = vi.hoisted(() => ({ patch: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  apiClient: api,
  APIClientError: class APIClientError extends Error {},
}));

vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

vi.mock('@xyflow/react', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  const stateful = () => (initial: unknown) => {
    const [value, setValue] = react.useState(initial);
    return [value, setValue, vi.fn()];
  };
  return {
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    ReactFlow: ({
      nodes,
      onNodeClick,
      children,
    }: {
      nodes: { id: string; data: { label: string } }[];
      onNodeClick?: (e: unknown, node: unknown) => void;
      children?: ReactNode;
    }) => (
      <div data-testid="rf" data-node-count={nodes.length}>
        {nodes.map((n) => (
          <button key={n.id} data-testid={`rf-node-${n.id}`} onClick={(e) => onNodeClick?.(e, n)}>
            {n.data.label}
          </button>
        ))}
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useReactFlow: () => ({ screenToFlowPosition: (p: unknown) => p }),
    useNodesState: stateful(),
    useEdgesState: stateful(),
  };
});

import {
  MapBuilder,
  type MapEditorGraph,
} from '@/components/admin/framework/map-builder/map-builder';

const PUBLISHED_DEF = {
  nodes: [
    {
      key: 'm',
      type: 'module',
      moduleSlug: 'm',
      completionMode: 'once',
      meta: { _layout: { x: 0, y: 0 } },
    },
  ],
  edges: [],
};

function graph(over: Partial<MapEditorGraph> = {}): MapEditorGraph {
  return {
    slug: 'demo',
    name: 'Demo map',
    description: null,
    draftDefinition: null,
    publishedVersion: { version: 2, definition: PUBLISHED_DEF },
    ...over,
  };
}

beforeEach(() => {
  api.patch.mockReset().mockResolvedValue({});
  api.get.mockReset().mockResolvedValue(graph());
  router.refresh.mockReset();
});

describe('MapBuilder header', () => {
  it('shows the map name, slug and published status', () => {
    render(<MapBuilder graph={graph()} />);
    expect(screen.getByText('Demo map')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('Published v2')).toBeInTheDocument();
  });

  it('disables Discard when there is no draft', () => {
    render(<MapBuilder graph={graph()} />);
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeDisabled();
  });

  it('enables Discard when a draft is present', () => {
    render(<MapBuilder graph={graph({ draftDefinition: PUBLISHED_DEF })} />);
    expect(screen.getByRole('button', { name: 'Discard draft' })).toBeEnabled();
  });

  it('shows the Unpublished status when the map has no published version', () => {
    render(<MapBuilder graph={graph({ publishedVersion: null })} />);
    expect(screen.getByText('Unpublished')).toBeInTheDocument();
  });

  it('reflects a draft on a published map in the status pill', () => {
    render(<MapBuilder graph={graph({ draftDefinition: PUBLISHED_DEF })} />);
    expect(screen.getByText(/Published v2 · editing draft/)).toBeInTheDocument();
  });
});

describe('MapBuilder selection', () => {
  it('shows the selected node’s identity and module binding in the panel', async () => {
    const user = userEvent.setup();
    render(<MapBuilder graph={graph()} />);
    await user.click(screen.getByTestId('rf-node-m'));
    const panel = screen.getByTestId('map-node-panel');
    expect(panel).toHaveTextContent('Module');
    expect(panel).toHaveTextContent('m');
  });
});

describe('MapBuilder save', () => {
  it('PATCHes the canvas as a schema-valid { definition }', async () => {
    const user = userEvent.setup();
    render(<MapBuilder graph={graph()} />);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const [path, opts] = api.patch.mock.calls[0];
    expect(path).toBe('/api/v1/admin/framework/maps/demo');
    const def = (opts as { body: { definition: { nodes: { key: string }[] } } }).body.definition;
    expect(def.nodes.map((n) => n.key)).toEqual(['m']);
    // Position round-tripped back into meta._layout.
    expect((def.nodes[0] as unknown as { meta: { _layout: unknown } }).meta._layout).toEqual({
      x: 0,
      y: 0,
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('surfaces a save failure as an inline alert', async () => {
    api.patch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<MapBuilder graph={graph()} />);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('MapBuilder discard', () => {
  it('PATCHes { definition: null } after confirm, then reloads', async () => {
    window.confirm = vi.fn(() => true);
    const user = userEvent.setup();
    render(<MapBuilder graph={graph({ draftDefinition: PUBLISHED_DEF })} />);

    await user.click(screen.getByRole('button', { name: 'Discard draft' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/v1/admin/framework/maps/demo', {
        body: { definition: null },
      })
    );
    expect(api.get).toHaveBeenCalledWith('/api/v1/admin/framework/maps/demo');
  });

  it('does nothing when the confirm is dismissed', async () => {
    window.confirm = vi.fn(() => false);
    const user = userEvent.setup();
    render(<MapBuilder graph={graph({ draftDefinition: PUBLISHED_DEF })} />);

    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe('MapBuilder delete', () => {
  it('removes the selected node from the canvas', async () => {
    const user = userEvent.setup();
    render(<MapBuilder graph={graph()} />);
    expect(screen.getByTestId('rf')).toHaveAttribute('data-node-count', '1');

    await user.click(screen.getByTestId('rf-node-m'));
    await user.click(screen.getByRole('button', { name: /Delete node/ }));

    expect(screen.getByTestId('rf')).toHaveAttribute('data-node-count', '0');
  });
});

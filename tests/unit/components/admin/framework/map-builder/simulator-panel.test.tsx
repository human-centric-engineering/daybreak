/**
 * SimulatorPanel (f-map-editor t-5, F18) — the dry-run dialog. Proves it collects
 * synthetic inputs (completions, slot rows, clock), POSTs the current definition + those
 * inputs to the dry-run endpoint with coerced values, and renders the ranked moves +
 * per-node availability (with narrated lock reasons). A failure surfaces inline.
 *
 * @see components/admin/framework/map-builder/simulator-panel.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  apiClient: api,
  APIClientError: class APIClientError extends Error {},
}));

import { SimulatorPanel } from '@/components/admin/framework/map-builder/simulator-panel';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';

const DEFINITION: MapDefinition = {
  nodes: [
    { key: 'a', type: 'milestone', completionMode: 'once' },
    { key: 'b', type: 'milestone', completionMode: 'once' },
  ],
  edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
};

const RESULT = {
  nodes: [
    { nodeKey: 'a', available: true, lockReasons: [] },
    { nodeKey: 'b', available: false, lockReasons: [{ kind: 'prerequisite', from: 'a' }] },
  ],
  validMoves: ['a'],
  firsts: [],
  ranked: [
    {
      nodeKey: 'a',
      score: 3,
      reasons: [{ code: 'first_arrival', detail: 'New ground' }],
      related: [],
    },
  ],
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof SimulatorPanel>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <SimulatorPanel
      slug="demo"
      open
      onOpenChange={onOpenChange}
      nodeKeys={['a', 'b']}
      slotOptions={['readiness']}
      getDefinition={() => DEFINITION}
      {...overrides}
    />
  );
  return { onOpenChange };
}

beforeEach(() => {
  api.post.mockReset().mockResolvedValue(RESULT);
});

describe('SimulatorPanel', () => {
  it('POSTs the definition + synthetic inputs with coerced slot values', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId('sim-complete-a'));
    await user.click(screen.getByTestId('sim-add-slot'));
    await user.type(screen.getByTestId('sim-slot-slug-0'), 'readiness');
    await user.type(screen.getByTestId('sim-slot-value-0'), '8');
    await user.click(screen.getByTestId('sim-run'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, opts] = api.post.mock.calls[0];
    expect(path).toBe('/api/v1/admin/framework/maps/demo/dry-run');
    const body = (
      opts as { body: { definition: unknown; completions: string[]; slots: unknown[] } }
    ).body;
    expect(body.definition).toEqual(DEFINITION);
    expect(body.completions).toEqual(['a']);
    // '8' is coerced to the number 8 (the slot-condition value type).
    expect(body.slots).toEqual([{ slug: 'readiness', value: 8 }]);
  });

  it('renders the ranked moves and per-node availability with narrated lock reasons', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('sim-run'));

    expect(await screen.findByTestId('sim-rank-a')).toHaveTextContent('New ground');
    expect(screen.getByTestId('sim-node-a')).toHaveTextContent('available');
    const bRow = screen.getByTestId('sim-node-b');
    expect(bRow).toHaveTextContent('locked');
    expect(bRow).toHaveTextContent('Prerequisite "a" not met');
  });

  it('coerces boolean and text slot values by their form', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('sim-add-slot'));
    await user.type(screen.getByTestId('sim-slot-slug-0'), 'active');
    await user.type(screen.getByTestId('sim-slot-value-0'), 'true');
    await user.click(screen.getByTestId('sim-add-slot'));
    await user.type(screen.getByTestId('sim-slot-slug-1'), 'tier');
    await user.type(screen.getByTestId('sim-slot-value-1'), 'gold');
    await user.click(screen.getByTestId('sim-run'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const body = (api.post.mock.calls[0][1] as { body: { slots: unknown[] } }).body;
    expect(body.slots).toEqual([
      { slug: 'active', value: true },
      { slug: 'tier', value: 'gold' },
    ]);
  });

  it('narrates every lock-reason kind and the empty-moves case', async () => {
    api.post.mockResolvedValueOnce({
      nodes: [
        {
          nodeKey: 'm',
          available: false,
          lockReasons: [{ kind: 'module', moduleSlug: 'coach', reason: 'flag' }],
        },
        { nodeKey: 'c', available: false, lockReasons: [{ kind: 'completed' }] },
        {
          nodeKey: 'g',
          available: false,
          lockReasons: [
            { kind: 'condition', from: 'a', edgeType: 'prerequisite', condition: undefined },
          ],
        },
        {
          nodeKey: 'u',
          available: false,
          lockReasons: [{ kind: 'unlock', candidates: ['x', 'y'] }],
        },
      ],
      validMoves: [],
      firsts: [],
      ranked: [],
    });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('sim-run'));

    expect(await screen.findByText(/No available moves/i)).toBeInTheDocument();
    expect(screen.getByTestId('sim-node-m')).toHaveTextContent('Module "coach" is not live (flag)');
    expect(screen.getByTestId('sim-node-c')).toHaveTextContent('Already completed');
    expect(screen.getByTestId('sim-node-g')).toHaveTextContent('prerequisite condition from "a"');
    expect(screen.getByTestId('sim-node-u')).toHaveTextContent('Needs one of: x, y');
  });

  it('drops an out-of-range confidence rather than letting it 400 the run', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('sim-add-slot'));
    await user.type(screen.getByTestId('sim-slot-slug-0'), 'x');
    await user.type(screen.getByTestId('sim-slot-value-0'), '3');
    await user.type(screen.getByTestId('sim-slot-conf-0'), '5.5'); // not an int 1–10 → dropped
    await user.click(screen.getByTestId('sim-run'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const body = (api.post.mock.calls[0][1] as { body: { slots: Record<string, unknown>[] } }).body;
    expect(body.slots[0]).not.toHaveProperty('confidence');
  });

  it('renders first-arrival triggers when the result has them', async () => {
    api.post.mockResolvedValueOnce({ ...RESULT, firsts: ['b'] });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('sim-run'));
    expect(await screen.findByTestId('sim-firsts')).toHaveTextContent('b');
  });

  it('clears a prior result when the dialog is closed and reopened', async () => {
    const user = userEvent.setup();
    const props = {
      slug: 'demo',
      onOpenChange: vi.fn(),
      nodeKeys: ['a', 'b'],
      slotOptions: ['readiness'],
      getDefinition: () => DEFINITION,
    };
    const { rerender } = render(<SimulatorPanel {...props} open />);
    await user.click(screen.getByTestId('sim-run'));
    await screen.findByTestId('sim-node-a');

    rerender(<SimulatorPanel {...props} open={false} />);
    rerender(<SimulatorPanel {...props} open />);

    expect(screen.getByText(/set inputs and run/i)).toBeInTheDocument();
    expect(screen.queryByTestId('sim-node-a')).not.toBeInTheDocument();
  });

  it('surfaces a dry-run failure inline', async () => {
    api.post.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('sim-run'));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('shows a hint when the canvas has no nodes', () => {
    renderPanel({ nodeKeys: [] });
    expect(screen.getByText(/add nodes to the canvas first/i)).toBeInTheDocument();
  });
});

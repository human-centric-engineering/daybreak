/**
 * Integration test — AgentsTab (f-ops-views t-4a).
 *
 * The module's agent-binding surface: the stitched read table (primary badge, tombstone /
 * inactive flags, degraded "unknown agent" row), the bind flow (roster fetched on demand →
 * pick agent + seat → POST), make-primary (PATCH), and two-step unbind (DELETE) — plus the
 * unregistered / no-seats notices and server field errors surfaced on the form.
 *
 * @see components/admin/framework/module-detail/agents-tab.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ModuleAgentBindingListItem } from '@/lib/framework/modules/view';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

import { AgentsTab } from '@/components/admin/framework/module-detail/agents-tab';
import { apiClient, APIClientError } from '@/lib/api/client';

function binding(over: Partial<ModuleAgentBindingListItem> = {}): ModuleAgentBindingListItem {
  return {
    id: 'b1',
    agentId: 'agent-1',
    role: 'companion',
    isPrimary: false,
    config: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    agent: {
      id: 'agent-1',
      name: 'Companion Agent',
      slug: 'companion-agent',
      isActive: true,
      deletedAt: null,
    },
    ...over,
  };
}

const ROSTER = [{ id: 'agent-1', name: 'Companion Agent', slug: 'companion' }];
const AGENTS_URL = '/api/v1/admin/framework/modules/reading/agents';

function renderTab(props: Partial<Parameters<typeof AgentsTab>[0]> = {}) {
  return render(
    <AgentsTab
      slug="reading"
      agentRoles={{ registered: true, roles: ['companion'] }}
      bindings={[binding()]}
      {...props}
    />
  );
}

describe('AgentsTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a binding with its agent and a primary badge', () => {
    renderTab({ bindings: [binding({ isPrimary: true })] });
    expect(screen.getByText('Companion Agent')).toBeInTheDocument();
    expect(screen.getByText('companion')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('flags a tombstoned agent and degrades a removed one', () => {
    renderTab({
      bindings: [
        binding({
          id: 'b1',
          agent: {
            id: 'a',
            name: 'Gone',
            slug: 'x',
            isActive: false,
            deletedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        binding({ id: 'b2', agent: null }),
      ],
    });
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByText(/unknown agent/i)).toBeInTheDocument();
  });

  it('shows the empty state and a bind button when registered with seats', () => {
    renderTab({ bindings: [] });
    expect(screen.getByText(/no agents are bound yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bind agent/i })).toBeInTheDocument();
  });

  it('binds an agent into a seat (roster fetched on demand → POST)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue(ROSTER);
    vi.mocked(apiClient.post).mockResolvedValue(undefined);

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));

    const agentCombo = await screen.findByRole('combobox', { name: /agent/i });
    await waitFor(() => expect(agentCombo).toBeEnabled());
    await user.click(agentCombo);
    await user.click(await screen.findByRole('option', { name: /companion agent/i }));

    await user.click(screen.getByRole('combobox', { name: /seat/i }));
    await user.click(await screen.findByRole('option', { name: /^companion$/i }));

    await user.click(screen.getByLabelText(/primary seat/i));
    await user.click(screen.getByRole('button', { name: /^bind$/i }));

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/admin/orchestration/agents?isActive=true&kind=chat&limit=100'
    );
    expect(apiClient.post).toHaveBeenCalledWith(AGENTS_URL, {
      body: { agentId: 'agent-1', role: 'companion', isPrimary: true },
    });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('blocks a bind with no agent/seat selected', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue(ROSTER);

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /agent/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /^bind$/i }));

    expect(screen.getByText(/choose an agent and a seat/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('shows a roster load error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockRejectedValue(new APIClientError('boom', 'ERR', 500));

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('surfaces the server field error on a failed bind', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue(ROSTER);
    vi.mocked(apiClient.post).mockRejectedValue(
      new APIClientError('bad', 'VALIDATION_ERROR', 422, {
        role: ['Must be one of: companion'],
      })
    );

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));
    const agentCombo = await screen.findByRole('combobox', { name: /agent/i });
    await waitFor(() => expect(agentCombo).toBeEnabled());
    await user.click(agentCombo);
    await user.click(await screen.findByRole('option', { name: /companion agent/i }));
    await user.click(screen.getByRole('combobox', { name: /seat/i }));
    await user.click(await screen.findByRole('option', { name: /^companion$/i }));
    await user.click(screen.getByRole('button', { name: /^bind$/i }));

    expect(await screen.findByText(/must be one of: companion/i)).toBeInTheDocument();
  });

  it('promotes a binding to primary', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue(undefined);

    renderTab({ bindings: [binding({ id: 'b9', isPrimary: false })] });
    await user.click(screen.getByRole('button', { name: /make primary/i }));

    expect(apiClient.patch).toHaveBeenCalledWith(`${AGENTS_URL}/b9`, {
      body: { isPrimary: true },
    });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('unbinds through a two-step confirm', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    renderTab({ bindings: [binding({ id: 'b9' })] });
    await user.click(screen.getByRole('button', { name: /^unbind$/i }));
    expect(apiClient.delete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(apiClient.delete).toHaveBeenCalledWith(`${AGENTS_URL}/b9`);
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("locks other rows' actions while a confirm is open (no concurrent mutations)", async () => {
    const user = userEvent.setup();
    renderTab({
      bindings: [
        binding({ id: 'a', role: 'companion', isPrimary: true }),
        binding({ id: 'b', role: 'coach', isPrimary: false }),
      ],
    });

    // Open the unbind confirm on the first row.
    const unbindButtons = screen.getAllByRole('button', { name: /^unbind$/i });
    await user.click(unbindButtons[0]);

    // The other row's "Make primary" action is now locked.
    expect(screen.getByRole('button', { name: /make primary/i })).toBeDisabled();
  });

  it('hides the bind form for an unregistered module but still lists bindings', () => {
    renderTab({ agentRoles: { registered: false, roles: [] } });
    expect(screen.queryByRole('button', { name: /bind agent/i })).not.toBeInTheDocument();
    expect(screen.getByText(/code is not registered/i)).toBeInTheDocument();
    expect(screen.getByText('Companion Agent')).toBeInTheDocument();
  });

  it('explains when a registered module declares no seats', () => {
    renderTab({ agentRoles: { registered: true, roles: [] }, bindings: [] });
    expect(screen.queryByRole('button', { name: /bind agent/i })).not.toBeInTheDocument();
    expect(screen.getByText(/declares no agent seats/i)).toBeInTheDocument();
  });

  it('shows a "couldn\'t load seats" state (not "unregistered") when the roles fetch failed', () => {
    renderTab({ agentRoles: null });
    expect(screen.queryByRole('button', { name: /bind agent/i })).not.toBeInTheDocument();
    expect(screen.getByText(/seats couldn.t be loaded/i)).toBeInTheDocument();
    // Must NOT make the false "unregistered" claim.
    expect(screen.queryByText(/code is not registered/i)).not.toBeInTheDocument();
    // Bindings still render for cleanup.
    expect(screen.getByText('Companion Agent')).toBeInTheDocument();
  });

  it('shows a "couldn\'t load bindings" state (not "no agents") when the bindings fetch failed', () => {
    renderTab({ bindings: null });
    expect(screen.getByText(/current bindings couldn.t be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/no agents are bound yet/i)).not.toBeInTheDocument();
  });

  it('flags a truncated roster (first 100 shown)', async () => {
    const user = userEvent.setup();
    const bigRoster = Array.from({ length: 100 }, (_, i) => ({
      id: `a${i}`,
      name: `Agent ${i}`,
      slug: `agent-${i}`,
    }));
    vi.mocked(apiClient.get).mockResolvedValue(bigRoster);

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));

    expect(await screen.findByText(/showing the first 100 agents/i)).toBeInTheDocument();
  });

  it('does not start a second roster fetch while one is in flight', async () => {
    const user = userEvent.setup();
    // A never-resolving fetch keeps the first request in flight.
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getByRole('button', { name: /bind agent/i }));

    // Still exactly one fetch — the open-once guard blocked the reopen refetch.
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('threads a debounced ?q= search into the roster fetch', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue(ROSTER);

    renderTab({ bindings: [] });
    await user.click(screen.getByRole('button', { name: /bind agent/i }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /agent/i })).toBeEnabled());

    await user.type(screen.getByRole('searchbox', { name: /search agents/i }), 'comp');

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/admin/orchestration/agents?isActive=true&kind=chat&limit=100&q=comp'
      )
    );
  });

  it('flags a binding that carries a config override', () => {
    renderTab({ bindings: [binding({ config: { tone: 'warm' } })] });
    // The seat cell shows a "Config" badge (distinct from the "Edit config" row action).
    expect(screen.getByText('Config')).toBeInTheDocument();
  });

  it('edits a per-binding config override (prefilled → PATCH)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue(undefined);

    renderTab({ bindings: [binding({ id: 'b9', config: { tone: 'warm' } })] });
    await user.click(screen.getByRole('button', { name: /edit config/i }));

    const editor = screen.getByLabelText(/binding config/i);
    expect(editor).toHaveValue(JSON.stringify({ tone: 'warm' }, null, 2));

    fireEvent.change(editor, { target: { value: '{"tone":"cool"}' } });
    await user.click(screen.getByRole('button', { name: /save config/i }));

    expect(apiClient.patch).toHaveBeenCalledWith(`${AGENTS_URL}/b9`, {
      body: { config: { tone: 'cool' } },
    });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('clears the override when the config editor is emptied (config: null)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue(undefined);

    renderTab({ bindings: [binding({ id: 'b9', config: { tone: 'warm' } })] });
    await user.click(screen.getByRole('button', { name: /edit config/i }));
    await user.clear(screen.getByLabelText(/binding config/i));
    await user.click(screen.getByRole('button', { name: /save config/i }));

    expect(apiClient.patch).toHaveBeenCalledWith(`${AGENTS_URL}/b9`, {
      body: { config: null },
    });
  });

  it('blocks an invalid-JSON config without calling the API', async () => {
    const user = userEvent.setup();

    renderTab({ bindings: [binding({ id: 'b9', config: null })] });
    await user.click(screen.getByRole('button', { name: /edit config/i }));
    fireEvent.change(screen.getByLabelText(/binding config/i), {
      target: { value: 'not json' },
    });
    await user.click(screen.getByRole('button', { name: /save config/i }));

    expect(screen.getByText(/config: invalid json/i)).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('rejects a non-object JSON config (array)', async () => {
    const user = userEvent.setup();

    renderTab({ bindings: [binding({ id: 'b9', config: null })] });
    await user.click(screen.getByRole('button', { name: /edit config/i }));
    fireEvent.change(screen.getByLabelText(/binding config/i), {
      target: { value: '[1, 2]' },
    });
    await user.click(screen.getByRole('button', { name: /save config/i }));

    expect(screen.getByText(/config must be a json object/i)).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('surfaces a server field error on a failed config save', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockRejectedValue(
      new APIClientError('bad', 'VALIDATION_ERROR', 422, { config: ['must be an object'] })
    );

    renderTab({ bindings: [binding({ id: 'b9', config: null })] });
    await user.click(screen.getByRole('button', { name: /edit config/i }));
    fireEvent.change(screen.getByLabelText(/binding config/i), {
      target: { value: '{"a":1}' },
    });
    await user.click(screen.getByRole('button', { name: /save config/i }));

    expect(await screen.findByText(/must be an object/i)).toBeInTheDocument();
  });

  it("locks other rows' actions while a config editor is open", async () => {
    const user = userEvent.setup();
    renderTab({
      bindings: [
        binding({ id: 'a', role: 'companion', isPrimary: true, config: null }),
        binding({ id: 'b', role: 'coach', isPrimary: false, config: null }),
      ],
    });

    // Open the config editor on the first row.
    const editButtons = screen.getAllByRole('button', { name: /edit config/i });
    await user.click(editButtons[0]);

    // The other row's "Make primary" action is now locked (no concurrent mutation).
    expect(screen.getByRole('button', { name: /make primary/i })).toBeDisabled();
  });
});

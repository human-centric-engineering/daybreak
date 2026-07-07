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
import { render, screen, waitFor } from '@testing-library/react';
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
    <AgentsTab slug="reading" registered roles={['companion']} bindings={[binding()]} {...props} />
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
      '/api/v1/admin/orchestration/agents?isActive=true&limit=100'
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

  it('hides the bind form for an unregistered module but still lists bindings', () => {
    renderTab({ registered: false, roles: [] });
    expect(screen.queryByRole('button', { name: /bind agent/i })).not.toBeInTheDocument();
    expect(screen.getByText(/code is not registered/i)).toBeInTheDocument();
    expect(screen.getByText('Companion Agent')).toBeInTheDocument();
  });

  it('explains when a registered module declares no seats', () => {
    renderTab({ registered: true, roles: [], bindings: [] });
    expect(screen.queryByRole('button', { name: /bind agent/i })).not.toBeInTheDocument();
    expect(screen.getByText(/declares no agent seats/i)).toBeInTheDocument();
  });
});

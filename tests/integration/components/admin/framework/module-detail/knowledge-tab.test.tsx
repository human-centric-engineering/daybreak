/**
 * Integration test — KnowledgeTab (f-ops-views t-4c).
 *
 * The module's knowledge-scope surface: two sections (Documents, Tags) rendered through one
 * generic GrantSection over the shared binding-tab primitives — the stitched read tables (with
 * a degraded "removed" row), the grant flow (roster fetched on demand → pick → POST), two-step
 * revoke (DELETE ?documentId|?tagId), and the null-scope / empty / server-error states.
 *
 * @see components/admin/framework/module-detail/knowledge-tab.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ModuleKnowledgeScopeView } from '@/lib/framework/modules/view';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

import { KnowledgeTab } from '@/components/admin/framework/module-detail/knowledge-tab';
import { apiClient, APIClientError } from '@/lib/api/client';

function scope(over: Partial<ModuleKnowledgeScopeView> = {}): ModuleKnowledgeScopeView {
  return {
    documents: [
      {
        documentId: 'd1',
        createdAt: '2026-02-01T00:00:00.000Z',
        document: { id: 'd1', name: 'Doc One', slug: 'doc-one', status: 'ready' },
      },
    ],
    tags: [
      {
        tagId: 't1',
        createdAt: '2026-02-01T00:00:00.000Z',
        tag: { id: 't1', name: 'Tag One', slug: 'tag-one' },
      },
    ],
    ...over,
  };
}

const BASE = '/api/v1/admin/framework/modules/reading/knowledge';
const renderTab = (props: Partial<Parameters<typeof KnowledgeTab>[0]> = {}) =>
  render(<KnowledgeTab slug="reading" scope={scope()} {...props} />);

describe('KnowledgeTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the granted documents and tags', () => {
    renderTab();
    expect(screen.getByText('Doc One')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('Tag One')).toBeInTheDocument();
  });

  it('degrades a removed document / tag', () => {
    renderTab({
      scope: {
        documents: [{ documentId: 'd9', createdAt: 'x', document: null }],
        tags: [{ tagId: 't9', createdAt: 'x', tag: null }],
      },
    });
    expect(screen.getByText(/unknown document/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown tag/i)).toBeInTheDocument();
  });

  it('shows a "couldn\'t load" state (not empty) when the scope fetch failed', () => {
    renderTab({ scope: null });
    expect(screen.getByText(/knowledge scope couldn.t be loaded/i)).toBeInTheDocument();
  });

  it('shows empty states per section', () => {
    renderTab({ scope: { documents: [], tags: [] } });
    expect(screen.getByText(/no documents in scope/i)).toBeInTheDocument();
    expect(screen.getByText(/no tags in scope/i)).toBeInTheDocument();
  });

  it('grants a document (roster fetched on demand → POST { documentId })', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue([{ id: 'new-doc', name: 'New Doc' }]);
    vi.mocked(apiClient.post).mockResolvedValue(undefined);

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add document/i }));

    const combo = await screen.findByRole('combobox', { name: /documents/i });
    await waitFor(() => expect(combo).toBeEnabled());
    await user.click(combo);
    await user.click(await screen.findByRole('option', { name: /new doc/i }));
    await user.click(screen.getByRole('button', { name: /^grant$/i }));

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/admin/orchestration/knowledge/documents?limit=100'
    );
    expect(apiClient.post).toHaveBeenCalledWith(BASE, { body: { documentId: 'new-doc' } });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('threads a debounced ?q= search into the documents roster fetch', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue([{ id: 'new-doc', name: 'New Doc' }]);

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add document/i }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /documents/i })).toBeEnabled());

    await user.type(screen.getByRole('searchbox', { name: /search documents/i }), 'onboard');

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/admin/orchestration/knowledge/documents?limit=100&q=onboard'
      )
    );
  });

  it('grants a tag (POST { tagId } from the tags roster)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue([{ id: 'new-tag', name: 'New Tag' }]);
    vi.mocked(apiClient.post).mockResolvedValue(undefined);

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add tag/i }));

    const combo = await screen.findByRole('combobox', { name: /tags/i });
    await waitFor(() => expect(combo).toBeEnabled());
    await user.click(combo);
    await user.click(await screen.findByRole('option', { name: /new tag/i }));
    await user.click(screen.getByRole('button', { name: /^grant$/i }));

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/admin/orchestration/knowledge/tags?limit=100'
    );
    expect(apiClient.post).toHaveBeenCalledWith(BASE, { body: { tagId: 'new-tag' } });
  });

  it('blocks a grant with nothing selected', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue([{ id: 'x', name: 'X' }]);

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add document/i }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /documents/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /^grant$/i }));

    expect(screen.getByText(/choose a document/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('surfaces the server field error on a failed grant', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue([{ id: 'new-doc', name: 'New Doc' }]);
    vi.mocked(apiClient.post).mockRejectedValue(
      new APIClientError('bad', 'VALIDATION_ERROR', 422, { documentId: ['Already granted'] })
    );

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add document/i }));
    const combo = await screen.findByRole('combobox', { name: /documents/i });
    await waitFor(() => expect(combo).toBeEnabled());
    await user.click(combo);
    await user.click(await screen.findByRole('option', { name: /new doc/i }));
    await user.click(screen.getByRole('button', { name: /^grant$/i }));

    expect(await screen.findByText(/already granted/i)).toBeInTheDocument();
  });

  it('shows a roster load error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockRejectedValue(new APIClientError('boom', 'ERR', 500));

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add document/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('revokes a document through a two-step confirm (DELETE ?documentId=)', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    renderTab();
    // The Documents section is first; open its row's confirm.
    const revokeButtons = screen.getAllByRole('button', { name: /^revoke$/i });
    await user.click(revokeButtons[0]);
    expect(apiClient.delete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}?documentId=d1`);
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('flags a truncated roster (first 100 shown)', async () => {
    const user = userEvent.setup();
    const big = Array.from({ length: 100 }, (_, i) => ({ id: `d${i}`, name: `Doc ${i}` }));
    vi.mocked(apiClient.get).mockResolvedValue(big);

    renderTab({ scope: { documents: [], tags: [] } });
    await user.click(screen.getByRole('button', { name: /add document/i }));

    expect(await screen.findByText(/showing the first 100 documents/i)).toBeInTheDocument();
  });

  it("locks a section's rows while a revoke confirm is open", async () => {
    const user = userEvent.setup();
    renderTab({
      scope: {
        documents: [
          {
            documentId: 'd1',
            createdAt: 'x',
            document: { id: 'd1', name: 'Doc One', slug: 'one', status: 'ready' },
          },
          {
            documentId: 'd2',
            createdAt: 'x',
            document: { id: 'd2', name: 'Doc Two', slug: 'two', status: 'ready' },
          },
        ],
        tags: [],
      },
    });

    const docsSection = screen.getByText('Doc One').closest('section') as HTMLElement;
    const revokeButtons = within(docsSection).getAllByRole('button', { name: /^revoke$/i });
    await user.click(revokeButtons[0]);

    // The other document row's Revoke trigger is now locked (only one "Revoke" remains — the
    // opened row shows Confirm/Cancel, not Revoke).
    const remaining = within(docsSection).getByRole('button', { name: /^revoke$/i });
    expect(remaining).toBeDisabled();
  });
});

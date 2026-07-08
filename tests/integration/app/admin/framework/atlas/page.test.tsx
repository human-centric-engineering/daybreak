/**
 * Framework atlas page (f-atlas t-2a) — the thin server page. Fetches the composition projection and
 * renders `<AtlasView>`, degrading to a "couldn't load" notice on any fetch failure (a pure read — no
 * 404). The fetch layer + the view are mocked; this pins the server page's success/degrade branches.
 *
 * @see app/admin/framework/atlas/page.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const fetchMock = vi.hoisted(() => ({ serverFetch: vi.fn(), parseApiResponse: vi.fn() }));
vi.mock('@/lib/api/server-fetch', () => fetchMock);
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/components/admin/framework/atlas/atlas-view', () => ({
  AtlasView: () => <div data-testid="atlas-view" />,
}));

import FrameworkAtlasPage from '@/app/admin/framework/atlas/page';

beforeEach(() => vi.clearAllMocks());

describe('FrameworkAtlasPage', () => {
  it('renders the atlas view when the projection loads', async () => {
    fetchMock.serverFetch.mockResolvedValue({ ok: true });
    fetchMock.parseApiResponse.mockResolvedValue({ success: true, data: { modules: [] } });

    render(await FrameworkAtlasPage());

    expect(screen.getByTestId('atlas-view')).toBeInTheDocument();
  });

  it('degrades to a couldn`t-load notice on a fetch failure', async () => {
    fetchMock.serverFetch.mockResolvedValue({ ok: false });

    render(await FrameworkAtlasPage());

    expect(screen.queryByTestId('atlas-view')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t be loaded/i);
  });

  it('degrades when the fetch throws', async () => {
    fetchMock.serverFetch.mockRejectedValue(new Error('network'));

    render(await FrameworkAtlasPage());

    expect(screen.queryByTestId('atlas-view')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

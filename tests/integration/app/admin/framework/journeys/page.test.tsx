/**
 * Integration test — Framework Journeys list page (f-ops-views t-5b).
 *
 * The server component pre-renders the first page of journeys from a mocked
 * `serverFetch` and hands it to `<JourneysTable>`; it reads the total from the
 * paginated `meta` (for the cap hint) and never throws on a fetch failure (renders
 * the empty state — the modules-list precedent).
 *
 * @see app/admin/framework/journeys/page.tsx
 */

import type { JourneyListItem } from '@/lib/framework/facilitation/journey/view';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

function makeJourney(id: string): JourneyListItem {
  return {
    id,
    userId: `user_${id}`,
    graphSlug: 'main-map',
    contextKey: '',
    startedAt: '2026-06-01T10:00:00.000Z',
    graph: { name: 'Main Map', slug: 'main-map' },
    progress: { total: 4, completed: 2 },
  };
}

describe('FrameworkJourneysPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the heading + rows, and the cap hint from the paginated meta total', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: true,
      data: [makeJourney('j1')],
      meta: { page: 1, limit: 100, total: 150, totalPages: 2 },
    });

    const { default: Page } = await import('@/app/admin/framework/journeys/page');
    render(await Page());

    expect(screen.getByRole('heading', { name: /^journeys$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('user_j1')).toBeInTheDocument();
      expect(screen.getByText(/Showing the first 1 of 150 journeys/)).toBeInTheDocument();
    });
  });

  it('falls back to the row count when the envelope carries no meta total (no cap hint)', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: [makeJourney('j1')] });

    const { default: Page } = await import('@/app/admin/framework/journeys/page');
    render(await Page());

    expect(screen.getByText('user_j1')).toBeInTheDocument();
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('renders the empty state when the fetch is not ok (no throw)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    const { default: Page } = await import('@/app/admin/framework/journeys/page');
    render(await Page());

    expect(screen.getByText('No journeys yet.')).toBeInTheDocument();
  });

  it('renders the empty state when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: Page } = await import('@/app/admin/framework/journeys/page');
    render(await Page());

    expect(screen.getByText('No journeys yet.')).toBeInTheDocument();
  });
});

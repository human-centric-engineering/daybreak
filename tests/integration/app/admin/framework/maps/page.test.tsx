/**
 * Integration test — Framework Maps list page (f-map-editor t-1).
 *
 * The server component pre-renders every map from a mocked `serverFetch` and hands it
 * to `<MapsTable>`; a fetch failure never throws (renders the empty state — the
 * journeys/modules-list precedent).
 *
 * @see app/admin/framework/maps/page.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import type { MapListItem } from '@/components/admin/framework/maps-table';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function makeMap(slug: string): MapListItem {
  return {
    id: `map-${slug}`,
    slug,
    name: `Map ${slug}`,
    description: null,
    publishedVersionId: 'v1',
    draftDefinition: null,
    updatedAt: '2026-06-01T10:00:00.000Z',
  };
}

describe('FrameworkMapsPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the heading + a row per map', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: [makeMap('alpha')] });

    const { default: Page } = await import('@/app/admin/framework/maps/page');
    render(await Page());

    expect(screen.getByRole('heading', { name: /^maps$/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Map alpha')).toBeInTheDocument());
  });

  it('renders the empty state when the fetch is not ok (no throw)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    const { default: Page } = await import('@/app/admin/framework/maps/page');
    render(await Page());

    expect(screen.getByText(/No facilitation maps yet/)).toBeInTheDocument();
  });

  it('renders the empty state when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: Page } = await import('@/app/admin/framework/maps/page');
    render(await Page());

    expect(screen.getByText(/No facilitation maps yet/)).toBeInTheDocument();
  });

  it('renders the empty state when the envelope is unsuccessful', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'X', message: 'nope' },
    });

    const { default: Page } = await import('@/app/admin/framework/maps/page');
    render(await Page());

    expect(screen.getByText(/No facilitation maps yet/)).toBeInTheDocument();
  });
});

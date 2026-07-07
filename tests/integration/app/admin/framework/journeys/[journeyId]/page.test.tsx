/**
 * Integration test — Framework Journey detail page (f-ops-views t-5b).
 *
 * The server component fetches the detail bundle and routes each outcome: a 404
 * `notFound()`s (genuinely missing), any other failure renders a "couldn't load"
 * state (never a false 404), and a success renders the explorer. `<JourneyExplorer>`
 * is mocked to isolate the page's fetch/branching logic from the canvas internals.
 *
 * @see app/admin/framework/journeys/[journeyId]/page.tsx
 */

import type { JourneyDetailView } from '@/lib/framework/facilitation/journey/view';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/components/admin/framework/journey-explorer/journey-explorer', () => ({
  JourneyExplorer: ({ detail }: { detail: JourneyDetailView }) => (
    <div data-testid="explorer" data-map={detail.graph?.name ?? 'none'} />
  ),
}));

const DETAIL: JourneyDetailView = {
  journey: {
    id: 'j1',
    userId: 'user_alice',
    graphSlug: 'main',
    contextKey: '',
    startedAt: '2026-06-01T10:00:00.000Z',
  },
  graph: { name: 'Main Map', slug: 'main', structure: null },
  nodeStates: [],
  timeline: [],
};

const ctx = (journeyId = 'j1') => ({ params: Promise.resolve({ journeyId }) });

describe('FrameworkJourneyDetailPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the explorer for a found journey', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: DETAIL });

    const { default: Page } = await import('@/app/admin/framework/journeys/[journeyId]/page');
    render(await Page(ctx()));

    expect(screen.getByTestId('explorer')).toHaveAttribute('data-map', 'Main Map');
  });

  it('404s (notFound) when the endpoint returns 404', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    const { notFound } = await import('next/navigation');

    const { default: Page } = await import('@/app/admin/framework/journeys/[journeyId]/page');
    await expect(Page(ctx('missing'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(vi.mocked(notFound)).toHaveBeenCalled();
  });

  it('renders a couldn’t-load state on a non-404 failure (not a false 404)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const { notFound } = await import('next/navigation');

    const { default: Page } = await import('@/app/admin/framework/journeys/[journeyId]/page');
    render(await Page(ctx()));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be loaded/i);
    expect(vi.mocked(notFound)).not.toHaveBeenCalled();
  });

  it('renders a couldn’t-load state when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: Page } = await import('@/app/admin/framework/journeys/[journeyId]/page');
    render(await Page(ctx()));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be loaded/i);
  });
});

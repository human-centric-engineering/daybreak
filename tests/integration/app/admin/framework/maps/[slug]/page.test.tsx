/**
 * Integration test — Framework Map editor page (f-map-editor t-1).
 *
 * The server component fetches one map (`GET /maps/[slug]`) and hands it to
 * `<MapBuilder>` (stubbed here — the canvas is React-Flow-heavy and covered by its
 * own test). A genuinely missing map (404) calls `notFound()`; a transient failure
 * renders the "couldn't load" state rather than a false 404.
 *
 * @see app/admin/framework/maps/[slug]/page.tsx
 */

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
vi.mock('@/components/admin/framework/map-builder/map-builder', () => ({
  MapBuilder: ({ graph }: { graph: { slug: string } }) => (
    <div data-testid="map-builder">editor: {graph.slug}</div>
  ),
}));

const GRAPH = {
  slug: 'demo',
  name: 'Demo map',
  description: null,
  draftDefinition: null,
  publishedVersion: { version: 1, definition: { nodes: [], edges: [] } },
};

describe('FrameworkMapEditorPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the editor for a map that exists', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: GRAPH });

    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/page');
    render(await Page({ params: Promise.resolve({ slug: 'demo' }) }));

    expect(screen.getByTestId('map-builder')).toHaveTextContent('editor: demo');
  });

  it('404s when the map does not exist', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/page');
    await expect(Page({ params: Promise.resolve({ slug: 'ghost' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });

  it('renders the couldn’t-load state on a transient failure (not a false 404)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/page');
    render(await Page({ params: Promise.resolve({ slug: 'demo' }) }));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be loaded/i);
  });

  it('renders the couldn’t-load state when serverFetch throws', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/page');
    render(await Page({ params: Promise.resolve({ slug: 'demo' }) }));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be loaded/i);
  });
});

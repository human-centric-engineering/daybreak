/**
 * Integration test — Framework Map Heat page (f-engagement-analytics t-1b).
 *
 * The server component fetches the map (structure) + its heat in parallel and routes each
 * outcome: a map 404 `notFound()`s, any other map failure renders a "couldn't load" state
 * (never a false 404), a heat-only failure degrades to an all-neutral map (empty heat), and
 * success renders the view. `<MapHeatView>` is mocked to isolate the page's fetch/branching.
 *
 * @see app/admin/framework/maps/[slug]/heat/page.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type { MapHeat } from '@/lib/framework/engagement/map-heat';

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
vi.mock('@/components/admin/framework/map-heat/map-heat-view', () => ({
  MapHeatView: ({
    graphName,
    structure,
    heat,
  }: {
    graphName: string;
    structure: MapDefinition | null;
    heat: MapHeat;
  }) => (
    <div
      data-testid="heat-view"
      data-name={graphName}
      data-has-structure={String(structure !== null)}
      data-heat-nodes={heat.nodes.length}
    />
  ),
}));

const PUBLISHED: MapDefinition = {
  nodes: [{ key: 'a', type: 'module', moduleSlug: 'a', completionMode: 'once' }],
  edges: [],
};
const MAP = { name: 'Onboarding', slug: 'onboarding', publishedVersion: { definition: PUBLISHED } };
const HEAT: MapHeat = { graphSlug: 'onboarding', nodes: [] };

/** A response tagged so the parseApiResponse mock can return the right body per call. */
const tagged = (kind: 'map' | 'heat', over: Partial<Response> = {}) =>
  ({ ok: true, status: 200, _kind: kind, ...over }) as unknown as Response;

const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });

async function armFetch(mapRes: Response, heatRes: Response) {
  const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
  vi.mocked(serverFetch).mockImplementation((path: string) =>
    Promise.resolve(path.includes('/heat') ? heatRes : mapRes)
  );
  vi.mocked(parseApiResponse).mockImplementation((res: Response) =>
    Promise.resolve(
      (res as { _kind?: string })._kind === 'heat'
        ? { success: true, data: HEAT }
        : { success: true, data: MAP }
    )
  );
}

describe('FrameworkMapHeatPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the heat view with the parsed structure and heat on success', async () => {
    await armFetch(tagged('map'), tagged('heat'));
    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/heat/page');
    render(await Page(ctx()));

    const view = screen.getByTestId('heat-view');
    expect(view).toHaveAttribute('data-name', 'Onboarding');
    expect(view).toHaveAttribute('data-has-structure', 'true');
  });

  it('404s (notFound) when the map endpoint returns 404', async () => {
    await armFetch(tagged('map', { ok: false, status: 404 }), tagged('heat'));
    const { notFound } = await import('next/navigation');
    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/heat/page');

    await expect(Page(ctx('missing'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(vi.mocked(notFound)).toHaveBeenCalled();
  });

  it('renders a couldn’t-load state on a non-404 map failure (not a false 404)', async () => {
    await armFetch(tagged('map', { ok: false, status: 500 }), tagged('heat'));
    const { notFound } = await import('next/navigation');
    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/heat/page');

    render(await Page(ctx()));
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be loaded/i);
    expect(vi.mocked(notFound)).not.toHaveBeenCalled();
  });

  it('degrades to an empty heat when only the heat fetch fails (map still renders)', async () => {
    await armFetch(tagged('map'), tagged('heat', { ok: false, status: 500 }));
    const { default: Page } = await import('@/app/admin/framework/maps/[slug]/heat/page');

    render(await Page(ctx()));
    const view = screen.getByTestId('heat-view');
    expect(view).toHaveAttribute('data-has-structure', 'true');
    expect(view).toHaveAttribute('data-heat-nodes', '0'); // empty heat fallback
  });
});

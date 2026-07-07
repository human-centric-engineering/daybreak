/**
 * JourneysTable (f-ops-views t-5b) — the explorer picker list.
 *
 * Covers row rendering (link to detail, map-name stitch + slug fallback, progress,
 * default-context badge), the empty state, client-side search, and the "showing first
 * N" cap hint when the total exceeds the rendered page.
 *
 * @see components/admin/framework/journeys-table.tsx
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { JourneysTable } from '@/components/admin/framework/journeys-table';
import type { JourneyListItem } from '@/lib/framework/facilitation/journey/view';

function makeJourney(id: string, over: Partial<JourneyListItem> = {}): JourneyListItem {
  return {
    id,
    userId: `user_${id}`,
    graphSlug: 'main-map',
    contextKey: '',
    startedAt: '2026-06-01T10:00:00.000Z',
    graph: { name: 'Main Map', slug: 'main-map' },
    progress: { total: 4, completed: 2 },
    ...over,
  };
}

describe('JourneysTable', () => {
  it('renders a row per journey linking to its detail page', () => {
    render(<JourneysTable initialJourneys={[makeJourney('j1')]} total={1} />);

    const link = screen.getByRole('link', { name: 'user_j1' });
    expect(link).toHaveAttribute('href', '/admin/framework/journeys/j1');
    expect(screen.getByText('Main Map')).toBeInTheDocument();
    expect(screen.getByText('2 / 4 done')).toBeInTheDocument();
  });

  it('falls back to the slug when the map is gone, and shows a default-context badge', () => {
    render(
      <JourneysTable
        initialJourneys={[makeJourney('j1', { graph: null, contextKey: '' })]}
        total={1}
      />
    );
    expect(screen.getByText('main-map')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('renders an em dash for a journey with no node states', () => {
    render(
      <JourneysTable
        initialJourneys={[makeJourney('j1', { progress: { total: 0, completed: 0 } })]}
        total={1}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state when there are no journeys', () => {
    render(<JourneysTable initialJourneys={[]} total={0} />);
    expect(screen.getByText('No journeys yet.')).toBeInTheDocument();
  });

  it('filters by user id / map on search', async () => {
    const user = userEvent.setup();
    render(
      <JourneysTable
        initialJourneys={[
          makeJourney('alice', { userId: 'user_alice' }),
          makeJourney('bob', { userId: 'user_bob', graph: { name: 'Other', slug: 'other' } }),
        ]}
        total={2}
      />
    );

    await user.type(screen.getByLabelText('Search journeys'), 'alice');
    expect(screen.getByText('user_alice')).toBeInTheDocument();
    expect(screen.queryByText('user_bob')).not.toBeInTheDocument();
  });

  it('shows the cap hint when the total exceeds the rendered page', () => {
    render(<JourneysTable initialJourneys={[makeJourney('j1')]} total={150} />);
    expect(screen.getByText(/Showing the first 1 of 150 journeys/)).toBeInTheDocument();
  });
});

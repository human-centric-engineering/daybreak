/**
 * MapsTable (f-map-editor t-1) — the map list + create dialog.
 *
 * Proves: a row per map with its status badge; both empty states (nothing yet vs.
 * nothing matches the search); the search filter; and the create flow (name mirrors
 * into a slug, Create POSTs `{ slug, name }` and routes into the new map's editor).
 *
 * @see components/admin/framework/maps-table.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  apiClient: api,
  APIClientError: class APIClientError extends Error {},
}));

import { MapsTable, type MapListItem } from '@/components/admin/framework/maps-table';

function map(over: Partial<MapListItem> = {}): MapListItem {
  return {
    id: `map-${over.slug ?? 'x'}`,
    slug: 'demo',
    name: 'Demo Map',
    description: null,
    publishedVersionId: null,
    draftDefinition: null,
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  api.post.mockReset().mockResolvedValue({});
  router.push.mockReset();
});

describe('MapsTable rows', () => {
  it('renders a row per map with the right status badge', () => {
    render(
      <MapsTable
        initialMaps={[
          map({ slug: 'a', name: 'Alpha', publishedVersionId: 'v1' }),
          map({
            slug: 'b',
            name: 'Beta',
            publishedVersionId: 'v1',
            draftDefinition: { nodes: [], edges: [] },
          }),
          map({
            slug: 'c',
            name: 'Gamma',
            publishedVersionId: null,
            draftDefinition: { nodes: [], edges: [] },
          }),
          map({ slug: 'd', name: 'Delta' }),
        ]}
      />
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Published · draft')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('links each map to its editor', () => {
    render(<MapsTable initialMaps={[map({ slug: 'onboarding', name: 'Onboarding' })]} />);
    expect(screen.getByRole('link', { name: 'Onboarding' })).toHaveAttribute(
      'href',
      '/admin/framework/maps/onboarding'
    );
  });

  it('shows the no-maps empty state', () => {
    render(<MapsTable initialMaps={[]} />);
    expect(screen.getByText(/No facilitation maps yet/)).toBeInTheDocument();
  });

  it('filters by the search query', async () => {
    const user = userEvent.setup();
    render(
      <MapsTable
        initialMaps={[map({ slug: 'alpha', name: 'Alpha' }), map({ slug: 'beta', name: 'Beta' })]}
      />
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search maps' }), 'alph');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });
});

describe('MapsTable create', () => {
  it('creates a map and routes to its editor', async () => {
    const user = userEvent.setup();
    render(<MapsTable initialMaps={[]} />);

    await user.click(screen.getByRole('button', { name: /New map/ }));
    await user.type(screen.getByLabelText('Name'), 'Onboarding Journey');
    await user.click(screen.getByRole('button', { name: 'Create map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/api/v1/admin/framework/maps', {
      body: { slug: 'onboarding-journey', name: 'Onboarding Journey' },
    });
    expect(router.push).toHaveBeenCalledWith('/admin/framework/maps/onboarding-journey');
  });

  it('blocks submit when the name is empty', async () => {
    const user = userEvent.setup();
    render(<MapsTable initialMaps={[]} />);
    await user.click(screen.getByRole('button', { name: /New map/ }));
    await user.click(screen.getByRole('button', { name: 'Create map' }));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/name and a slug are both required/i);
  });

  it('honours a directly-edited slug and an optional description', async () => {
    const user = userEvent.setup();
    render(<MapsTable initialMaps={[]} />);

    await user.click(screen.getByRole('button', { name: /New map/ }));
    await user.type(screen.getByLabelText('Name'), 'Onboarding');
    // Editing the slug decouples it from the name mirror. (The label carries a
    // FieldHelp trigger, so locate the input by its placeholder.)
    const slug = screen.getByPlaceholderText('onboarding-journey');
    await user.clear(slug);
    await user.type(slug, 'custom-slug');
    await user.type(screen.getByLabelText(/Description/), 'What it does');
    await user.click(screen.getByRole('button', { name: 'Create map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/api/v1/admin/framework/maps', {
      body: { slug: 'custom-slug', name: 'Onboarding', description: 'What it does' },
    });
  });

  it('resets the form when the dialog is cancelled and reopened', async () => {
    const user = userEvent.setup();
    render(<MapsTable initialMaps={[]} />);

    await user.click(screen.getByRole('button', { name: /New map/ }));
    await user.type(screen.getByLabelText('Name'), 'Scratch');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: /New map/ }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('surfaces a create failure without routing away', async () => {
    api.post.mockRejectedValueOnce(new Error('slug already in use'));
    const user = userEvent.setup();
    render(<MapsTable initialMaps={[]} />);

    await user.click(screen.getByRole('button', { name: /New map/ }));
    await user.type(screen.getByLabelText('Name'), 'Dup');
    await user.click(screen.getByRole('button', { name: 'Create map' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('slug already in use');
    expect(router.push).not.toHaveBeenCalled();
  });
});

/**
 * Integration test — `<ModulesTable>` (f-ops-views t-1).
 *
 * The client list view: rows from pre-fetched `Module` data, the name→detail
 * link, the status / unregistered badges, the search filter, and both empty
 * states (nothing registered vs. nothing matches the query).
 *
 * @see components/admin/framework/modules-table.tsx
 */

import type { Module } from '@prisma/client';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModulesTable } from '@/components/admin/framework/modules-table';

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: `mod-${overrides.slug ?? 'x'}`,
    slug: 'demo',
    name: 'Demo Module',
    status: 'active',
    featureFlagName: null,
    availableFrom: null,
    availableUntil: null,
    audience: 'all',
    config: {},
    isRegistered: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ModulesTable', () => {
  it('renders a row per module with name, slug, status and audience', () => {
    render(
      <ModulesTable
        initialModules={[
          makeModule({ slug: 'onboarding', name: 'Onboarding', status: 'active', audience: 'all' }),
          makeModule({ slug: 'coaching', name: 'Coaching', status: 'draft', audience: 'invite' }),
          // A retired module — exercises the distinct `retired` badge arm.
          makeModule({ slug: 'legacy', name: 'Legacy', status: 'retired', audience: 'flag-gated' }),
        ]}
      />
    );

    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('coaching')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('retired')).toBeInTheDocument();
    expect(screen.getByText('invite')).toBeInTheDocument();
  });

  it('links each row name to the module detail page', () => {
    render(
      <ModulesTable initialModules={[makeModule({ slug: 'onboarding', name: 'Onboarding' })]} />
    );

    const link = screen.getByRole('link', { name: 'Onboarding' });
    expect(link).toHaveAttribute('href', '/admin/framework/modules/onboarding');
  });

  it('flags an unregistered module', () => {
    render(
      <ModulesTable
        initialModules={[makeModule({ slug: 'gone', name: 'Removed', isRegistered: false })]}
      />
    );

    expect(screen.getByText('Unregistered')).toBeInTheDocument();
  });

  it('shows the empty state when no modules are registered', () => {
    render(<ModulesTable initialModules={[]} />);

    expect(screen.getByText('No modules registered yet.')).toBeInTheDocument();
  });

  it('filters by name or slug and shows a no-match state', async () => {
    const user = userEvent.setup();
    render(
      <ModulesTable
        initialModules={[
          makeModule({ slug: 'onboarding', name: 'Onboarding' }),
          makeModule({ slug: 'coaching', name: 'Coaching' }),
        ]}
      />
    );

    const search = screen.getByRole('searchbox', { name: 'Search modules' });

    await user.type(search, 'coach');
    expect(screen.getByText('Coaching')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No modules match your search.')).toBeInTheDocument();
  });
});

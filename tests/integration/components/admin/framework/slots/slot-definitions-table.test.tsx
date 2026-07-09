/**
 * Integration test — SlotDefinitionsTable (f-admin-surfaces t-1).
 *
 * Renders the slot-definition rows, links each to its detail page, badges the
 * sensitivity grade, and filters by slug / group as the operator types. Empty and
 * no-match states are distinct.
 *
 * @see components/admin/framework/slots/slot-definitions-table.tsx
 */

import type { SlotDefinitionView } from '@/lib/framework/data-slots/view';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SlotDefinitionsTable } from '@/components/admin/framework/slots/slot-definitions-table';

function makeDef(slug: string, over: Partial<SlotDefinitionView> = {}): SlotDefinitionView {
  return {
    id: `slot-${slug}`,
    slug,
    group: 'goals',
    description: 'A slot',
    scope: 'global',
    visibility: 'open',
    mode: 'targeted',
    dataType: 'text',
    sensitivity: 'standard',
    priorityWeight: 0,
    isActive: true,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...over,
  };
}

const DEFS = [
  makeDef('primary_goal'),
  makeDef('health_note', { group: 'wellbeing', sensitivity: 'sensitive' }),
];

describe('SlotDefinitionsTable', () => {
  it('renders rows linking to the detail page and badges sensitivity', () => {
    render(<SlotDefinitionsTable initialDefinitions={DEFS} />);

    const link = screen.getByRole('link', { name: 'primary_goal' });
    expect(link).toHaveAttribute('href', '/admin/framework/slots/primary_goal');
    expect(screen.getByText('sensitive')).toBeInTheDocument();
  });

  it('filters by slug as the operator types', async () => {
    const user = userEvent.setup();
    render(<SlotDefinitionsTable initialDefinitions={DEFS} />);

    await user.type(screen.getByRole('searchbox', { name: /search slots/i }), 'health');

    expect(screen.getByText('health_note')).toBeInTheDocument();
    expect(screen.queryByText('primary_goal')).not.toBeInTheDocument();
  });

  it('filters by group too', async () => {
    const user = userEvent.setup();
    render(<SlotDefinitionsTable initialDefinitions={DEFS} />);

    await user.type(screen.getByRole('searchbox', { name: /search slots/i }), 'wellbeing');

    expect(screen.getByText('health_note')).toBeInTheDocument();
    expect(screen.queryByText('primary_goal')).not.toBeInTheDocument();
  });

  it('shows the no-match state when nothing matches the search', async () => {
    const user = userEvent.setup();
    render(<SlotDefinitionsTable initialDefinitions={DEFS} />);

    await user.type(screen.getByRole('searchbox', { name: /search slots/i }), 'zzz');

    expect(screen.getByText('No slots match your search.')).toBeInTheDocument();
  });

  it('shows the empty state when there are no definitions', () => {
    render(<SlotDefinitionsTable initialDefinitions={[]} />);
    expect(screen.getByText('No slot definitions registered yet.')).toBeInTheDocument();
  });
});

/**
 * Integration test — RosterSearch (f-admin-surfaces t-4).
 *
 * The shared controlled search box for a binding-tab picker: renders a labelled searchbox bound
 * to the roster's `query`, and forwards typed input to the roster's `search` handler (the hook
 * owns the debounce; this component is just the input). Also reflects the loading state.
 *
 * @see components/admin/framework/module-detail/roster-search.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RosterSearch } from '@/components/admin/framework/module-detail/roster-search';
import type { BindingRoster } from '@/components/admin/framework/module-detail/use-binding-roster';

function roster<T>(over: Partial<BindingRoster<T>> = {}): BindingRoster<T> {
  return {
    roster: null,
    loading: false,
    error: null,
    capped: false,
    query: '',
    search: vi.fn(),
    load: vi.fn(),
    ...over,
  };
}

describe('RosterSearch', () => {
  it('renders a labelled searchbox reflecting the current query', () => {
    render(<RosterSearch roster={roster({ query: 'welcome' })} noun="workflow" id="wf-search" />);
    const box = screen.getByRole('searchbox', { name: /search workflows/i });
    expect(box).toHaveValue('welcome');
  });

  it('forwards typed input to the roster search handler', async () => {
    const user = userEvent.setup();
    const search = vi.fn();
    render(<RosterSearch roster={roster({ search })} noun="agent" id="agent-search" />);

    await user.type(screen.getByRole('searchbox', { name: /search agents/i }), 'ab');

    // One call per keystroke, each with the single character typed (input is controlled by the
    // parent hook, so value doesn't accumulate against a static `query` in this isolated test).
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenNthCalledWith(1, 'a');
    expect(search).toHaveBeenNthCalledWith(2, 'b');
  });

  it('marks the input busy while the roster is loading', () => {
    render(<RosterSearch roster={roster({ loading: true })} noun="document" id="doc-search" />);
    expect(screen.getByRole('searchbox', { name: /search documents/i })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});

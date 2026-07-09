/**
 * Integration test — Framework Slots list page (f-admin-surfaces t-1).
 *
 * The server component at `app/admin/framework/slots/page.tsx` pre-renders the
 * slot-definition list from a mocked `serverFetch` and hands it to
 * `<SlotDefinitionsTable>`, never throwing when the fetch fails (renders the empty
 * state instead) — the modules/journeys list precedent.
 *
 * @see app/admin/framework/slots/page.tsx
 */

import type { SlotDefinitionView } from '@/lib/framework/data-slots/view';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

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

const MOCK_DEFS = [
  makeDef('primary_goal'),
  makeDef('health_note', { sensitivity: 'sensitive', group: 'wellbeing' }),
];

describe('FrameworkSlotsPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the "Slots" heading and rows from pre-fetched data', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: MOCK_DEFS });

    const { default: FrameworkSlotsPage } = await import('@/app/admin/framework/slots/page');
    render(await FrameworkSlotsPage());

    expect(screen.getByRole('heading', { name: /^slots$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('primary_goal')).toBeInTheDocument();
      expect(screen.getByText('health_note')).toBeInTheDocument();
    });
  });

  it('renders the empty state when the fetch is not ok (no throw)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    const { default: FrameworkSlotsPage } = await import('@/app/admin/framework/slots/page');
    render(await FrameworkSlotsPage());

    expect(screen.getByText('No slot definitions registered yet.')).toBeInTheDocument();
  });

  it('renders the empty state (no throw) when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: FrameworkSlotsPage } = await import('@/app/admin/framework/slots/page');
    render(await FrameworkSlotsPage());

    expect(screen.getByText('No slot definitions registered yet.')).toBeInTheDocument();
  });
});

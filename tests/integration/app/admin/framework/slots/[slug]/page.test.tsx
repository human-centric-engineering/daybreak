/**
 * Integration test — Framework Slot detail page (f-admin-surfaces t-1).
 *
 * The server component finds the definition in the slot-definitions list (small set,
 * no per-slug endpoint) and pre-fetches the first masked page of its values. A slug no
 * definition declares 404s; a values-fetch failure degrades to an empty browser
 * (rather than throwing). The two `serverFetch` calls resolve in order:
 * definitions, then values.
 *
 * @see app/admin/framework/slots/[slug]/page.tsx
 */

import type { SlotDefinitionView, SlotValueHeadView } from '@/lib/framework/data-slots/view';
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

const DEF: SlotDefinitionView = {
  id: 'slot-primary_goal',
  slug: 'primary_goal',
  group: 'goals',
  description: 'The user primary goal',
  scope: 'global',
  visibility: 'open',
  mode: 'targeted',
  dataType: 'text',
  sensitivity: 'standard',
  priorityWeight: 0,
  isActive: true,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

const VALUE: SlotValueHeadView = {
  id: 'v1',
  userId: 'user_alice',
  slotSlug: 'primary_goal',
  version: 1,
  value: 'run a marathon',
  valueJson: null,
  confidence: 8,
  sourceType: 'direct',
  sensitivity: 'standard',
  masked: false,
  capturedAt: '2026-06-01T10:00:00.000Z',
};

async function renderPage(slug: string) {
  const { default: Page } = await import('@/app/admin/framework/slots/[slug]/page');
  return render(await Page({ params: Promise.resolve({ slug }) }));
}

describe('FrameworkSlotDetailPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the definition and its captured values', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse)
      .mockResolvedValueOnce({ success: true, data: [DEF] }) // definitions
      .mockResolvedValueOnce({ success: true, data: [VALUE], meta: { total: 1 } }); // values

    await renderPage('primary_goal');

    expect(screen.getByRole('heading', { name: 'primary_goal' })).toBeInTheDocument();
    expect(screen.getByText('run a marathon')).toBeInTheDocument();
  });

  it('404s when no definition declares the slug', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValueOnce({ success: true, data: [] });

    await expect(renderPage('nonexistent')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the definitions fetch is not ok', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValueOnce({ ok: false } as Response);

    await expect(renderPage('primary_goal')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('falls back to the row count when the values envelope carries no meta.total', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse)
      .mockResolvedValueOnce({ success: true, data: [DEF] }) // definitions
      .mockResolvedValueOnce({ success: true, data: [VALUE] }); // values, no meta

    await renderPage('primary_goal');

    // total falls back to data.length (1), so no "showing first N of M" hint.
    expect(screen.getByText('run a marathon')).toBeInTheDocument();
    expect(screen.queryByText(/showing the first/i)).not.toBeInTheDocument();
  });

  it('renders an empty browser when the values envelope is unsuccessful', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse)
      .mockResolvedValueOnce({ success: true, data: [DEF] }) // definitions
      .mockResolvedValueOnce({ success: false, error: { code: 'INTERNAL', message: 'boom' } }); // values

    await renderPage('primary_goal');

    expect(screen.getByText(/no values captured for this slot yet/i)).toBeInTheDocument();
  });

  it('renders the detail with an empty browser when the values fetch fails (no throw)', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch)
      .mockResolvedValueOnce({ ok: true } as Response) // definitions
      .mockResolvedValueOnce({ ok: false } as Response); // values
    vi.mocked(parseApiResponse).mockResolvedValueOnce({ success: true, data: [DEF] });

    await renderPage('primary_goal');

    expect(screen.getByRole('heading', { name: 'primary_goal' })).toBeInTheDocument();
    expect(screen.getByText(/no values captured for this slot yet/i)).toBeInTheDocument();
  });
});

/**
 * Integration test — Framework Proposals list page (f-admin-surfaces t-3).
 *
 * The server component at `app/admin/framework/proposals/page.tsx` pre-renders the
 * emergence proposal queue from a mocked `serverFetch` and hands it to `<ProposalsQueue>`,
 * never throwing when the fetch fails (renders the empty state instead) — the modules /
 * journeys / slots / policies list precedent.
 *
 * @see app/admin/framework/proposals/page.tsx
 */

import type { StructureChangeProposalView } from '@/lib/framework/facilitation/emergence/view';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// next/navigation is used by the client queue (router.push on row click).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function makeProposal(
  over: Partial<StructureChangeProposalView> = {}
): StructureChangeProposalView {
  return {
    id: 'scp-1',
    subjectType: 'map',
    subjectId: 'onboarding',
    baseVersion: 3,
    proposedDefinition: { nodes: [], edges: [] },
    status: 'pending',
    riskClass: 'unclassified',
    createdBy: 'agent:onboarding',
    reviewedBy: null,
    rejectionReason: null,
    publishedVersionId: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

const MOCK_PROPOSALS: StructureChangeProposalView[] = [
  makeProposal({ id: 'scp-1', status: 'pending', subjectId: 'onboarding' }),
  makeProposal({ id: 'scp-2', status: 'pending', subjectId: 'coaching', createdBy: 'user_a' }),
];

describe('FrameworkProposalsPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the "Proposals" heading and pending rows from pre-fetched data', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: MOCK_PROPOSALS });

    const { default: Page } = await import('@/app/admin/framework/proposals/page');
    render(await Page());

    expect(screen.getByRole('heading', { name: /^proposals$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('map:onboarding')).toBeInTheDocument();
      expect(screen.getByText('map:coaching')).toBeInTheDocument();
    });
  });

  it('renders the empty state when the fetch is not ok (no throw)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    const { default: Page } = await import('@/app/admin/framework/proposals/page');
    render(await Page());

    expect(screen.getByText('No structure-change proposals yet.')).toBeInTheDocument();
  });

  it('renders the empty state when the API envelope is unsuccessful', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL', message: 'boom' },
    });

    const { default: Page } = await import('@/app/admin/framework/proposals/page');
    render(await Page());

    expect(screen.getByText('No structure-change proposals yet.')).toBeInTheDocument();
  });

  it('renders the empty state (no throw) when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: Page } = await import('@/app/admin/framework/proposals/page');
    render(await Page());

    expect(screen.getByText('No structure-change proposals yet.')).toBeInTheDocument();
  });
});

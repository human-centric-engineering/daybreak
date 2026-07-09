/**
 * Integration test — Framework Proposal detail page (f-admin-surfaces t-3).
 *
 * The server component loads one proposal via `serverFetch(GET …/proposals/:id)` and hands
 * it to `<ProposalReview>`. An unknown/malformed id (fetch not ok), an unsuccessful envelope,
 * or a rejected fetch all resolve to `notFound()` rather than throwing.
 *
 * @see app/admin/framework/proposals/[proposalId]/page.tsx
 */

import type { StructureChangeProposalView } from '@/lib/framework/facilitation/emergence/view';
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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const PROPOSAL: StructureChangeProposalView = {
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
};

async function renderPage(proposalId: string) {
  const { default: Page } = await import('@/app/admin/framework/proposals/[proposalId]/page');
  return render(await Page({ params: Promise.resolve({ proposalId }) }));
}

describe('FrameworkProposalDetailPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the review for a found proposal', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: PROPOSAL });

    await renderPage('scp-1');

    expect(screen.getByRole('heading', { name: /structure-change proposal/i })).toBeInTheDocument();
    expect(screen.getByText('map:onboarding')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve & publish/i })).toBeInTheDocument();
  });

  it('404s when the fetch is not ok (unknown/malformed id)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);
    const { notFound } = await import('next/navigation');

    await expect(renderPage('nope')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('404s when the API envelope is unsuccessful', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    });
    const { notFound } = await import('next/navigation');

    await expect(renderPage('scp-1')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('404s (no throw from the fetch) when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));
    const { notFound } = await import('next/navigation');

    await expect(renderPage('scp-1')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProposalReview } from '@/components/admin/framework/proposals/proposal-review';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { StructureChangeProposalView } from '@/lib/framework/facilitation/emergence/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Proposal · Framework',
  description: 'Review a structure-change proposal and approve or reject it.',
};

/**
 * Admin — Framework Proposal detail (f-admin-surfaces t-3).
 *
 * A thin server component that loads one proposal via
 * `serverFetch(GET /facilitation/proposals/:id)` and hands it to the client
 * `<ProposalReview>` for approve / reject over the shipped API. An unknown id (or a
 * malformed one → 400) or any fetch failure resolves to `notFound()` rather than throwing.
 * Framework-tier per the X6 boundary.
 */
async function getProposal(id: string): Promise<StructureChangeProposalView | null> {
  try {
    const res = await serverFetch(
      `/api/v1/admin/framework/facilitation/proposals/${encodeURIComponent(id)}`
    );
    if (!res.ok) return null;
    const body = await parseApiResponse<StructureChangeProposalView>(res);
    if (!body.success) return null;
    return body.data;
  } catch (err) {
    logger.error('framework proposal detail page: fetch failed', err);
    return null;
  }
}

export default async function FrameworkProposalDetailPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  const proposal = await getProposal(proposalId);
  if (!proposal) notFound();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">Structure-change proposal</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">{proposal.id}</p>
      </header>

      <ProposalReview proposal={proposal} />
    </div>
  );
}

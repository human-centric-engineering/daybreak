import type { Metadata } from 'next';

import { ProposalsQueue } from '@/components/admin/framework/proposals/proposals-queue';
import { FieldHelp } from '@/components/ui/field-help';
import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { StructureChangeProposalView } from '@/lib/framework/facilitation/emergence/view';
import { logger } from '@/lib/logging';

export const metadata: Metadata = {
  title: 'Proposals · Framework',
  description: 'Review structure-change proposals from the emergence pipeline.',
};

/**
 * Admin — Framework Proposals review queue (f-admin-surfaces t-3).
 *
 * A thin server component that pre-renders the emergence proposal queue via
 * `serverFetch(GET /facilitation/proposals)` and hands it to the client
 * `<ProposalsQueue>` for status-filtered review; approve / reject live on each
 * proposal's detail page. Framework-tier per the X6 boundary. A fetch failure never
 * throws — the queue renders an empty state so the page stays usable (the modules /
 * journeys / slots / policies precedent). Proposal counts are small (rare human-gated
 * events), so the full set pre-renders and the client filters within it.
 */
async function getProposals(): Promise<StructureChangeProposalView[]> {
  try {
    const res = await serverFetch('/api/v1/admin/framework/facilitation/proposals');
    if (!res.ok) return [];
    const body = await parseApiResponse<StructureChangeProposalView[]>(res);
    if (!body.success) return [];
    return body.data;
  } catch (err) {
    logger.error('framework proposals list page: initial fetch failed', err);
    return [];
  }
}

export default async function FrameworkProposalsPage() {
  const proposals = await getProposals();

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <h1 className="text-2xl font-semibold">
          Proposals{' '}
          <FieldHelp title="What are structure-change proposals?" contentClassName="w-96">
            <p>
              A <strong>structure-change proposal</strong> is a proposed change to a facilitation
              map — raised by an agent (the emergence pipeline) or by a human — that is held for
              review rather than applied directly.
            </p>
            <p className="mt-2">
              Approving a pending proposal validates it and <em>publishes</em> a new map version
              (the author is preserved). Rejecting it records a reason and publishes nothing.
            </p>
          </FieldHelp>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The emergence review queue — approve a change to publish it, or reject it with a reason.
        </p>
      </header>

      <ProposalsQueue initialProposals={proposals} />
    </div>
  );
}

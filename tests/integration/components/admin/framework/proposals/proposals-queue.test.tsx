/**
 * Integration test — ProposalsQueue (f-admin-surfaces t-3).
 *
 * The emergence review queue over the shipped list API: renders a row per proposal with
 * its subject, author (agent vs user), risk, status and raised date; status tabs filter
 * the pre-fetched set client-side (default: pending) with count badges; and clicking a row
 * navigates to that proposal's review detail. Read-only — no writes here (approve/reject
 * live on the detail component).
 *
 * @see components/admin/framework/proposals/proposals-queue.tsx
 */

import type { StructureChangeProposalView } from '@/lib/framework/facilitation/emergence/view';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));

import { ProposalsQueue } from '@/components/admin/framework/proposals/proposals-queue';

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
    createdBy: 'user_admin',
    reviewedBy: null,
    rejectionReason: null,
    publishedVersionId: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

const PROPOSALS: StructureChangeProposalView[] = [
  makeProposal({ id: 'scp-1', status: 'pending', createdBy: 'agent:onboarding' }),
  makeProposal({ id: 'scp-2', status: 'pending', createdBy: 'user_alice', subjectId: 'coaching' }),
  makeProposal({
    id: 'scp-3',
    status: 'published',
    subjectId: 'retention',
    publishedVersionId: 'ver-9',
  }),
  makeProposal({ id: 'scp-4', status: 'rejected', rejectionReason: 'no' }),
];

describe('ProposalsQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to the pending tab and lists only pending proposals', () => {
    render(<ProposalsQueue initialProposals={PROPOSALS} />);

    const table = screen.getByRole('table');
    // Two pending subjects render; the published/rejected ones are filtered out by default.
    expect(within(table).getByText('map:onboarding')).toBeInTheDocument();
    expect(within(table).getByText('map:coaching')).toBeInTheDocument();
    // Author rendering: agent as a badge, user id plain.
    expect(within(table).getByText('agent:onboarding')).toBeInTheDocument();
    expect(within(table).getByText('user_alice')).toBeInTheDocument();
  });

  it('shows per-status count badges on the tabs', () => {
    render(<ProposalsQueue initialProposals={PROPOSALS} />);

    // Pending tab shows a "2" badge; published/rejected show "1" each.
    const pendingTab = screen.getByRole('tab', { name: /pending/i });
    expect(within(pendingTab).getByText('2')).toBeInTheDocument();
    const publishedTab = screen.getByRole('tab', { name: /published/i });
    expect(within(publishedTab).getByText('1')).toBeInTheDocument();
  });

  it('switches to another status tab and filters the list', async () => {
    const user = userEvent.setup();
    render(<ProposalsQueue initialProposals={PROPOSALS} />);

    await user.click(screen.getByRole('tab', { name: /published/i }));

    const table = screen.getByRole('table');
    await waitFor(() => {
      expect(within(table).queryByText('map:onboarding')).not.toBeInTheDocument();
    });
    // The published row (scp-3, subject retention) is the only one shown now.
    expect(within(table).getByText('map:retention')).toBeInTheDocument();
    expect(within(table).getByText('published')).toBeInTheDocument();
  });

  it('renders a per-status empty state when a tab has no rows', async () => {
    const user = userEvent.setup();
    render(<ProposalsQueue initialProposals={PROPOSALS} />);

    await user.click(screen.getByRole('tab', { name: /approved/i }));

    expect(await screen.findByText('No approved proposals.')).toBeInTheDocument();
  });

  it('renders the global empty state when there are no proposals', () => {
    render(<ProposalsQueue initialProposals={[]} />);
    expect(screen.getByText('No structure-change proposals yet.')).toBeInTheDocument();
  });

  it('navigates to the review detail when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<ProposalsQueue initialProposals={PROPOSALS} />);

    await user.click(screen.getByText('map:onboarding'));

    expect(nav.push).toHaveBeenCalledWith('/admin/framework/proposals/scp-1');
  });
});

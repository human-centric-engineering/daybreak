'use client';

/**
 * ProposalsQueue (f-admin-surfaces t-3) — the structure-change proposal review queue.
 *
 * A read-only list of every emergence proposal over the shipped
 * `GET /facilitation/proposals` API, with status-filter tabs (pending / approved /
 * rejected / published) mirroring the core `ApprovalsTabs`. Each row shows the subject,
 * author (`agent:<slug>` vs user), risk class, status, and when it was raised; clicking a
 * row opens its review detail (`/admin/framework/proposals/[id]`), where approve / reject
 * live. Counts are small in v1 (proposals are rare, human-gated events), so the full set
 * pre-renders and the tabs filter client-side — no per-status refetch.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PROPOSAL_STATUSES,
  type StructureChangeProposalView,
} from '@/lib/framework/facilitation/emergence/view';
import {
  AuthorLabel,
  StatusBadge,
} from '@/components/admin/framework/proposals/proposal-view-helpers';

/** Deterministic `YYYY-MM-DD` (UTC) — hydration-safe in this SSR'd component. */
function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface ProposalsQueueProps {
  initialProposals: StructureChangeProposalView[];
}

export function ProposalsQueue({ initialProposals }: ProposalsQueueProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('pending');

  /** Per-status counts for the tab badges, computed once over the pre-fetched set. */
  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of initialProposals) acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, [initialProposals]);

  const filtered = useMemo(
    () => initialProposals.filter((p) => p.status === status),
    [initialProposals, status]
  );

  return (
    <div className="space-y-4">
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {PROPOSAL_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">
              {s}
              {(counts[s] ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 text-[10px]">
                  {counts[s]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Raised</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  {initialProposals.length === 0
                    ? 'No structure-change proposals yet.'
                    : `No ${status} proposals.`}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((proposal) => (
                <TableRow
                  key={proposal.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/admin/framework/proposals/${proposal.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {proposal.subjectType}:{proposal.subjectId}
                  </TableCell>
                  <TableCell>
                    <AuthorLabel createdBy={proposal.createdBy} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {proposal.riskClass}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={proposal.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(proposal.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

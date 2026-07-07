'use client';

/**
 * JourneysTable (f-ops-views t-5b) — the explorer picker. A searchable list of user
 * journeys (filter by user id / map name / slug); each row links to the journey
 * detail (`/admin/framework/journeys/[id]`). Read-only, no per-row fetches (the list
 * endpoint is already enriched with the map name + a progress count). The page fetches
 * the first `limit` rows; when the total exceeds what's shown, a hint says so (search
 * over the full set is a follow-up — the same cap the binding-tab rosters carry).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { JourneyListItem } from '@/lib/framework/facilitation/journey/view';

/** Deterministic `YYYY-MM-DD` (UTC) — hydration-safe in this SSR'd component. */
function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface JourneysTableProps {
  initialJourneys: JourneyListItem[];
  /** Total journeys matching the (unfiltered) query, for the "showing first N" hint. */
  total: number;
}

export function JourneysTable({ initialJourneys, total }: JourneysTableProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialJourneys;
    return initialJourneys.filter(
      (j) =>
        j.userId.toLowerCase().includes(q) ||
        j.graphSlug.toLowerCase().includes(q) ||
        (j.graph?.name.toLowerCase().includes(q) ?? false)
    );
  }, [initialJourneys, query]);

  const capped = total > initialJourneys.length;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search by user or map…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search journeys"
        />
      </div>

      {capped && (
        <p className="text-muted-foreground text-xs">
          Showing the first {initialJourneys.length} of {total} journeys. Search filters this page
          only; full-set search isn&rsquo;t available yet.
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Map</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  {initialJourneys.length === 0
                    ? 'No journeys yet.'
                    : 'No journeys match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/admin/framework/journeys/${j.id}`} className="hover:underline">
                      {j.userId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {j.graph ? (
                      <span className="font-medium">{j.graph.name}</span>
                    ) : (
                      <span className="text-muted-foreground font-mono text-xs">{j.graphSlug}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {j.contextKey ? (
                      <span className="font-mono text-xs">{j.contextKey}</span>
                    ) : (
                      <Badge variant="outline">default</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {j.progress.total === 0
                      ? '—'
                      : `${j.progress.completed} / ${j.progress.total} done`}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(j.startedAt)}
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

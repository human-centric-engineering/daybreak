'use client';

/**
 * SlotDefinitionsTable (f-admin-surfaces t-1).
 *
 * Client list view for framework `SlotDefinition` rows. Renders a searchable table
 * (filter by slug / group); each row links to the slot detail page
 * (`/admin/framework/slots/[slug]`), which shows the definition and its captured
 * values. Read-only — no per-row fetches (the list endpoint is already the full set)
 * and no pagination (definition counts are small — one row per declared slot).
 */

import type { SlotDefinitionView } from '@/lib/framework/data-slots/view';
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

/**
 * Badge variant per sensitivity grade. `sensitivity` is a free-form string (X1), so
 * the default arm covers `standard` and any future value; the two graded classes get
 * a distinct treatment — `special_category` (strictest) is loudest.
 */
function sensitivityVariant(sensitivity: string): 'secondary' | 'outline' | 'destructive' {
  switch (sensitivity) {
    case 'special_category':
      return 'destructive';
    case 'sensitive':
      return 'outline';
    default:
      return 'secondary';
  }
}

interface SlotDefinitionsTableProps {
  initialDefinitions: SlotDefinitionView[];
}

export function SlotDefinitionsTable({ initialDefinitions }: SlotDefinitionsTableProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialDefinitions;
    return initialDefinitions.filter(
      (d) => d.slug.toLowerCase().includes(q) || d.group.toLowerCase().includes(q)
    );
  }, [initialDefinitions, query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search slots…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search slots"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  {initialDefinitions.length === 0
                    ? 'No slot definitions registered yet.'
                    : 'No slots match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/framework/slots/${d.slug}`} className="hover:underline">
                      {d.slug}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{d.group}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {d.scope}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{d.dataType}</TableCell>
                  <TableCell>
                    <Badge variant={sensitivityVariant(d.sensitivity)}>{d.sensitivity}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{d.mode}</TableCell>
                  <TableCell>
                    {d.isActive ? (
                      <span className="text-sm">Yes</span>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
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

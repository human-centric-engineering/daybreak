'use client';

/**
 * ModulesTable (f-ops-views t-1).
 *
 * Client list view for framework `Module` rows. Renders a searchable table
 * (filter by name / slug); each row links to the module detail page
 * (`/admin/framework/modules/[slug]`), which f-ops-views t-2 builds. Read-only —
 * no per-row fetches (the list endpoint is already enriched) and no pagination
 * (module counts are small — a handful per app). Config / version / binding /
 * lifecycle management all live on the detail page.
 */

import type { ModuleListItem } from '@/lib/framework/modules/view';
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
 * Badge variant per module status. `status` is a free-form string (X1), so the
 * default arm covers `draft`, `scheduled`, and any future value — only `active`
 * and `retired` get a distinct treatment.
 */
function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'retired':
      return 'outline';
    default:
      return 'secondary';
  }
}

/**
 * Format an ISO date string as a stable `YYYY-MM-DD` (UTC). Deterministic across
 * server and client render, so it can't trigger a hydration mismatch the way a
 * locale/timezone-dependent `toLocaleDateString()` would in this SSR'd component.
 */
function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface ModulesTableProps {
  initialModules: ModuleListItem[];
}

export function ModulesTable({ initialModules }: ModulesTableProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialModules;
    return initialModules.filter(
      (m) => m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)
    );
  }, [initialModules, query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search modules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Search modules"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                  {initialModules.length === 0
                    ? 'No modules registered yet.'
                    : 'No modules match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/framework/modules/${m.slug}`} className="hover:underline">
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {m.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{m.audience}</TableCell>
                  <TableCell>
                    {m.isRegistered ? (
                      <span className="text-sm">Yes</span>
                    ) : (
                      <Badge variant="outline">Unregistered</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(m.updatedAt)}
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

'use client';

/**
 * Shared proposal-view helpers (f-admin-surfaces t-3) — the small presentational bits
 * the queue and the review detail both render, kept in one place so the two surfaces stay
 * consistent (a proposal's author + status read the same everywhere).
 *
 * `parseAuthor` is the shipped f-emergence helper (pure string parsing of the
 * `"agent:<slug>"` convention, X6) — reused here, not re-implemented.
 */

import { Badge } from '@/components/ui/badge';
import { parseAuthor } from '@/lib/framework/facilitation/emergence/author';

/** Render a proposal's `createdBy` — an `agent:<slug>` author as a badge, a user id plain. */
export function AuthorLabel({ createdBy }: { createdBy: string }) {
  const author = parseAuthor(createdBy);
  if (author.kind === 'agent') {
    return (
      <Badge variant="outline" className="font-mono text-xs">
        agent:{author.slug}
      </Badge>
    );
  }
  return <span className="text-muted-foreground font-mono text-xs">{author.userId}</span>;
}

/** The Badge variant per status — a forward-compat unknown status falls back to `outline`. */
const STATUS_VARIANT: Record<string, 'secondary' | 'outline' | 'default' | 'destructive'> = {
  pending: 'secondary',
  approved: 'outline',
  published: 'default',
  rejected: 'destructive',
};

/** Render a proposal status as a coloured badge. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>;
}

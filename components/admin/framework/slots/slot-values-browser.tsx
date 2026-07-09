'use client';

/**
 * SlotValuesBrowser (f-admin-surfaces t-1).
 *
 * Client view for a slot's captured value heads. Renders the masked page the detail
 * page pre-fetched; a `sensitive` slot's values arrive masked and each offers a
 * **Reveal** affordance. Revealing triggers ONE audited re-fetch (`?reveal=true`)
 * whose stored values are cached, so subsequent per-row reveals are instant and cost
 * no further server round-trips (the reveal is audited once, when the page is
 * fetched). A `special_category` value is never stored in the clear (it is masked
 * before storage), so it has no reveal — the browser labels it plainly.
 *
 * No client pagination: the detail page pre-renders the first page and the "showing
 * first N of M" hint fires past it (the journeys-picker precedent). Read-only.
 */

import type { SlotValueHeadView } from '@/lib/framework/data-slots/view';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api/client';

/** Must match the detail page's pre-fetch limit — the reveal re-fetch pages the same rows. */
const VALUES_PAGE_LIMIT = 100;

/** Deterministic `YYYY-MM-DD HH:MM` (UTC) — hydration-safe (no locale/timezone drift). */
function formatDateTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

/** The stored form cached from a reveal fetch, keyed by value id. */
type RevealedForm = { value: string; valueJson: unknown };

interface SlotValuesBrowserProps {
  slotSlug: string;
  initialValues: SlotValueHeadView[];
  total: number;
}

export function SlotValuesBrowser({ slotSlug, initialValues, total }: SlotValuesBrowserProps) {
  // The stored (unmasked) values, fetched once on the first reveal; null until then.
  const [revealedCache, setRevealedCache] = useState<Map<string, RevealedForm> | null>(null);
  // Which rows the operator has chosen to reveal.
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shared in-flight reveal fetch, so concurrent first-reveals coalesce into ONE
  // request (one audit entry) rather than racing the completed-cache guard.
  const inFlight = useRef<Promise<Map<string, RevealedForm>> | null>(null);

  async function ensureRevealedCache(): Promise<Map<string, RevealedForm>> {
    if (revealedCache) return revealedCache;
    if (inFlight.current) return inFlight.current;

    const fetchPromise = (async () => {
      const data = await apiClient.get<SlotValueHeadView[]>('/api/v1/admin/framework/slot-values', {
        params: { slotSlug, reveal: true, limit: VALUES_PAGE_LIMIT },
      });
      const cache = new Map<string, RevealedForm>(
        data.map((r) => [r.id, { value: r.value, valueJson: r.valueJson }])
      );
      setRevealedCache(cache);
      return cache;
    })();

    inFlight.current = fetchPromise;
    try {
      return await fetchPromise;
    } finally {
      inFlight.current = null;
    }
  }

  async function handleReveal(id: string) {
    setError(null);
    try {
      setLoading(true);
      await ensureRevealedCache();
      setRevealedIds((prev) => new Set(prev).add(id));
    } catch {
      setError('Failed to reveal values. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleHide(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Ver.</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Captured</TableHead>
              <TableHead className="text-right">Sensitivity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialValues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  No values captured for this slot yet.
                </TableCell>
              </TableRow>
            ) : (
              initialValues.map((v) => {
                // The revealed form for this row, if the operator revealed it AND the
                // reveal fetch returned it; `undefined` otherwise (no `!` assertions).
                const revealed = revealedIds.has(v.id) ? revealedCache?.get(v.id) : undefined;
                const isRevealed = revealed !== undefined;
                const shownValue = revealed?.value ?? v.value;
                const canReveal = v.masked && v.sensitivity !== 'special_category';

                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {v.userId}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span
                        className={v.masked && !isRevealed ? 'text-muted-foreground italic' : ''}
                      >
                        {shownValue}
                      </span>
                      {canReveal &&
                        (isRevealed ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 h-6 px-2 text-xs"
                            onClick={() => handleHide(v.id)}
                          >
                            Hide
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2 h-6 px-2 text-xs"
                            disabled={loading}
                            onClick={() => void handleReveal(v.id)}
                          >
                            Reveal
                          </Button>
                        ))}
                      {v.masked && v.sensitivity === 'special_category' && (
                        <span className="text-muted-foreground ml-2 text-xs">(not stored)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{v.version}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{v.confidence}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{v.sourceType}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(v.capturedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={v.sensitivity === 'standard' ? 'secondary' : 'outline'}>
                        {v.sensitivity}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {total > initialValues.length && (
        <p className="text-muted-foreground text-xs">
          Showing the first {initialValues.length} of {total} values.
        </p>
      )}
    </div>
  );
}

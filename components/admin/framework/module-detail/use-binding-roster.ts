'use client';

/**
 * useBindingRoster (f-ops-views t-4c · searchable typeahead f-admin-surfaces t-4) — the shared
 * on-demand picker roster for the module binding tabs (Agents / Workflows / Knowledge).
 *
 * Each binding tab's create form picks a target (an agent, a workflow, a document/tag) from a
 * roster fetched from a core orchestration list endpoint. This hook owns that fetch: it loads
 * lazily (on first form-open, not on every detail-page render) and then lets the operator
 * **narrow the roster with a debounced `?q=` search**, so a target past the `ROSTER_LIMIT` cap
 * is reachable without deactivating others (the f-ops-views "searchable roster pickers"
 * follow-up — worst for Knowledge, whose corpora routinely exceed the cap).
 *
 * A monotonic request sequence drops any stale in-flight response: only the newest request's
 * result is applied, so a slow first load can't overwrite a newer search (or vice versa). The
 * roster is still capped at the list endpoints' max page size (`ROSTER_LIMIT`); `capped` lets a
 * consumer nudge the operator to search rather than silently hiding targets past the cap. A tab
 * with two rosters (Knowledge: documents + tags) uses one hook instance per roster.
 */

import { useEffect, useRef, useState } from 'react';
import { apiClient, APIClientError } from '@/lib/api/client';

/** The list endpoints' max page size (`paginationQuerySchema.limit.max`). */
export const ROSTER_LIMIT = 100;

/** Debounce for the `?q=` search re-query — 300ms balances responsiveness with server load. */
const SEARCH_DEBOUNCE_MS = 300;

/** Append a trimmed `?q=` (or `&q=`) to the roster URL; an empty term leaves the URL untouched. */
function rosterUrl(url: string, query: string): string {
  const q = query.trim();
  if (q === '') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}q=${encodeURIComponent(q)}`;
}

export interface BindingRoster<T> {
  /** The loaded roster, or `null` before the first successful load. */
  roster: T[] | null;
  /** True while a fetch (initial load or search re-query) is in flight. */
  loading: boolean;
  /** A load error message, or `null`. */
  error: string | null;
  /** True when the roster hit `ROSTER_LIMIT` (so it may be truncated — narrow it with search). */
  capped: boolean;
  /** The current search term (the controlled search-input value). */
  query: string;
  /** Update the search term; debounced `?q=` re-query once the picker has been opened. */
  search: (next: string) => void;
  /**
   * Re-arm the picker: cancel any pending fetch, clear the search term / error / roster, so the
   * next {@link load} fetches fresh (unfiltered). Call this when the form (re)opens — without it,
   * a failed first load would never retry and a prior search filter would linger on reopen.
   */
  reset: () => void;
  /** Open the roster and load it (fresh after a {@link reset}); narrowing goes through {@link search}. */
  load: () => Promise<void>;
}

export function useBindingRoster<T>(
  url: string,
  errorFallback = 'Failed to load options'
): BindingRoster<T> {
  const [roster, setRoster] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // `opened` gates search re-queries (nothing to narrow before the first load); `seq` is the
  // monotonic request id (newest wins, stale responses dropped); `debounce` holds the pending
  // search timer.
  const openedRef = useRef(false);
  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capped = roster !== null && roster.length >= ROSTER_LIMIT;

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  async function fetchRoster(q: string) {
    const seq = ++seqRef.current;
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.get<T[]>(rosterUrl(url, q));
      if (seq === seqRef.current) setRoster(data);
    } catch (err) {
      if (seq === seqRef.current) {
        setError(err instanceof APIClientError ? err.message : errorFallback);
      }
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  function reset() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    seqRef.current++; // invalidate any in-flight/pending response so it can't land after reset
    openedRef.current = false; // re-arm: the next load() fetches fresh
    setRoster(null);
    setQuery('');
    setError(null);
    setLoading(false);
  }

  async function load() {
    if (openedRef.current) return;
    openedRef.current = true;
    await fetchRoster('');
  }

  function search(next: string) {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Ignore keystrokes before the picker is opened — there's no roster to narrow yet.
    if (!openedRef.current) return;
    debounceRef.current = setTimeout(() => void fetchRoster(next), SEARCH_DEBOUNCE_MS);
  }

  return { roster, loading, error, capped, query, search, reset, load };
}

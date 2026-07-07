'use client';

/**
 * useBindingRoster (f-ops-views t-4c) — the shared on-demand picker roster for the module
 * binding tabs (Agents / Workflows / Knowledge).
 *
 * Each binding tab's create form picks a target (an agent, a workflow, a document/tag) from a
 * roster fetched from a core orchestration list endpoint. This hook owns that fetch: it loads
 * lazily (on first form-open, not on every detail-page render), **fetches at most once**, and
 * — critically — never starts a second fetch while one is in flight, so a late-arriving
 * response from an earlier open→cancel→reopen can't overwrite a newer one with a stale error.
 *
 * The roster is capped at the list endpoints' max page size (`ROSTER_LIMIT`); `capped` lets a
 * consumer flag the likely-truncated case rather than silently hiding targets past the cap.
 * A tab with two rosters (Knowledge: documents + tags) uses one hook instance per roster.
 */

import { useState } from 'react';
import { apiClient, APIClientError } from '@/lib/api/client';

/** The list endpoints' max page size (`paginationQuerySchema.limit.max`). */
export const ROSTER_LIMIT = 100;

export interface BindingRoster<T> {
  /** The loaded roster, or `null` before the first successful load. */
  roster: T[] | null;
  /** True while the (single) fetch is in flight. */
  loading: boolean;
  /** A load error message, or `null`. */
  error: string | null;
  /** True when the roster hit `ROSTER_LIMIT` (so it may be truncated). */
  capped: boolean;
  /** Load the roster once; a no-op if already loaded or a load is in flight. */
  load: () => Promise<void>;
}

export function useBindingRoster<T>(url: string): BindingRoster<T> {
  const [roster, setRoster] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capped = roster !== null && roster.length >= ROSTER_LIMIT;

  async function load() {
    if (roster !== null || loading) return;
    setError(null);
    setLoading(true);
    try {
      setRoster(await apiClient.get<T[]>(url));
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : 'Failed to load options');
    } finally {
      setLoading(false);
    }
  }

  return { roster, loading, error, capped, load };
}

'use client';

/**
 * useRowActions (f-ops-views t-4c) — the shared per-row action state for the module binding
 * tabs' read tables (Agents / Workflows / Knowledge).
 *
 * Each binding table runs at most one row mutation at a time and gates a destructive action
 * (unbind / revoke) behind a two-step confirm. This hook owns that state machine:
 *   - `confirmingId` — the row whose confirm prompt is open (via `setConfirmingId`).
 *   - `busyId` — the row with a mutation in flight; `run()` sets/clears it and captures errors.
 *   - `locked` — true while any row is busy OR a confirm is open anywhere. Non-confirm row
 *     actions gate on this, so a confirm can't be interleaved with another row's action into
 *     two concurrent mutations (the asymmetric-guard bug the t-4b review caught). The Confirm/
 *     Cancel buttons themselves gate on `busyId !== null` (see `<RowConfirm>`), so the open
 *     confirm stays actionable until something is actually in flight.
 */

import { useState } from 'react';
import { APIClientError } from '@/lib/api/client';

export interface RowActions {
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
  busyId: string | null;
  error: string | null;
  /** True while any row is busy or a confirm is open — gate non-confirm row actions on this. */
  locked: boolean;
  /**
   * Run a row mutation with busy tracking: sets `busyId`, awaits `fn`, clears the confirm on
   * success, and captures a failure into `error` (the server message, else `fallback`).
   */
  run: (id: string, fn: () => Promise<void>, fallback: string) => Promise<void>;
}

export function useRowActions(): RowActions {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = busyId !== null || confirmingId !== null;

  async function run(id: string, fn: () => Promise<void>, fallback: string) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setConfirmingId(null);
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  return { confirmingId, setConfirmingId, busyId, error, locked, run };
}

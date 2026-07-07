/**
 * Unit test — useRowActions (f-ops-views t-4c).
 *
 * The shared per-row action state for the binding tables: the confirm/busy/lock state machine
 * and `run()` (busy tracking, clear-confirm-on-success, error capture).
 *
 * @see components/admin/framework/module-detail/use-row-actions.ts
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useRowActions } from '@/components/admin/framework/module-detail/use-row-actions';
import { APIClientError } from '@/lib/api/client';

describe('useRowActions', () => {
  it('starts unlocked with no confirm / busy / error', () => {
    const { result } = renderHook(() => useRowActions());
    expect(result.current.locked).toBe(false);
    expect(result.current.confirmingId).toBeNull();
    expect(result.current.busyId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('locks while a confirm is open', () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.setConfirmingId('a'));
    expect(result.current.confirmingId).toBe('a');
    expect(result.current.locked).toBe(true);
  });

  it('run() clears the confirm on success', async () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.setConfirmingId('a'));
    await act(async () => {
      await result.current.run('a', async () => {}, 'fallback');
    });
    expect(result.current.confirmingId).toBeNull();
    expect(result.current.busyId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('run() captures the server message and keeps the confirm on failure', async () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.setConfirmingId('a'));
    await act(async () => {
      await result.current.run(
        'a',
        async () => {
          throw new APIClientError('nope', 'ERR', 400);
        },
        'fallback'
      );
    });
    expect(result.current.error).toBe('nope');
    expect(result.current.confirmingId).toBe('a');
    expect(result.current.busyId).toBeNull();
  });

  it('clears a stale error when a confirm opens (but not on cancel)', async () => {
    const { result } = renderHook(() => useRowActions());
    // A prior action failed, leaving an error.
    await act(async () => {
      await result.current.run(
        'a',
        async () => {
          throw new Error('boom');
        },
        'fallback'
      );
    });
    expect(result.current.error).toBe('fallback');

    // Opening a confirm on another row clears the stale error.
    act(() => result.current.setConfirmingId('b'));
    expect(result.current.error).toBeNull();

    // Re-set an error, then cancel — cancel leaves the error alone.
    await act(async () => {
      await result.current.run(
        'b',
        async () => {
          throw new Error('boom2');
        },
        'fallback2'
      );
    });
    expect(result.current.error).toBe('fallback2');
    act(() => result.current.setConfirmingId(null));
    expect(result.current.error).toBe('fallback2');
  });

  it('run() falls back to the given message for a non-APIClientError', async () => {
    const { result } = renderHook(() => useRowActions());
    await act(async () => {
      await result.current.run(
        'a',
        async () => {
          throw new Error('x');
        },
        'fallback'
      );
    });
    expect(result.current.error).toBe('fallback');
  });
});

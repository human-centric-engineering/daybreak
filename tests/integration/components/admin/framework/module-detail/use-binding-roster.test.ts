/**
 * Unit test — useBindingRoster (f-ops-views t-4c).
 *
 * The shared on-demand picker roster: loads once, serialises overlapping loads (in-flight
 * guard), captures errors, and flags the ROSTER_LIMIT cap.
 *
 * @see components/admin/framework/module-detail/use-binding-roster.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import {
  useBindingRoster,
  ROSTER_LIMIT,
} from '@/components/admin/framework/module-detail/use-binding-roster';
import { apiClient, APIClientError } from '@/lib/api/client';

describe('useBindingRoster', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the roster once and ignores a repeat load', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: 'a' }]);
    const { result } = renderHook(() => useBindingRoster<{ id: string }>('/url'));

    expect(result.current.roster).toBeNull();
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.roster).toEqual([{ id: 'a' }]);
    expect(apiClient.get).toHaveBeenCalledWith('/url');

    // Already loaded → a second load is a no-op.
    await act(async () => {
      await result.current.load();
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('captures a load error and leaves the roster null', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new APIClientError('boom', 'ERR', 500));
    const { result } = renderHook(() => useBindingRoster('/url'));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.error).toBe('boom');
    expect(result.current.roster).toBeNull();
  });

  it('uses the supplied fallback message for a non-APIClientError', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useBindingRoster('/url', 'Failed to load agents'));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.error).toBe('Failed to load agents');
  });

  it('flags capped when the roster hits ROSTER_LIMIT', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      Array.from({ length: ROSTER_LIMIT }, (_, i) => ({ id: String(i) }))
    );
    const { result } = renderHook(() => useBindingRoster<{ id: string }>('/url'));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.capped).toBe(true);
  });

  it('does not start a second fetch while one is in flight', async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(apiClient.get).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { result } = renderHook(() => useBindingRoster('/url'));

    await act(async () => {
      void result.current.load(); // starts the fetch → loading = true
    });
    await act(async () => {
      void result.current.load(); // re-render sees loading = true → guard returns
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve([]);
    });
  });
});

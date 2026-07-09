/**
 * Unit test — useBindingRoster (f-ops-views t-4c · searchable typeahead f-admin-surfaces t-4).
 *
 * The shared on-demand picker roster: opens (and fetches) once, then re-queries with a debounced
 * `?q=` search, captures errors, flags the ROSTER_LIMIT cap, and drops stale in-flight responses
 * so the newest request always wins.
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
      void result.current.load(); // starts the fetch → opened
    });
    await act(async () => {
      void result.current.load(); // opened already → guard returns
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve([]);
    });
  });

  it('re-queries with a debounced ?q= once the picker is opened', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiClient.get).mockResolvedValue([]);
      const { result } = renderHook(() => useBindingRoster<{ id: string }>('/url?isActive=true'));

      await act(async () => {
        await result.current.load();
      });
      // Initial load carries no q.
      expect(apiClient.get).toHaveBeenLastCalledWith('/url?isActive=true');

      // A search updates the controlled value immediately but only fetches after the debounce.
      act(() => result.current.search('welcome'));
      expect(result.current.query).toBe('welcome');
      expect(apiClient.get).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(apiClient.get).toHaveBeenLastCalledWith('/url?isActive=true&q=welcome');
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces rapid keystrokes into a single re-query (latest term wins)', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiClient.get).mockResolvedValue([]);
      const { result } = renderHook(() => useBindingRoster('/url'));
      await act(async () => {
        await result.current.load();
      });
      vi.mocked(apiClient.get).mockClear();

      act(() => result.current.search('w'));
      act(() => result.current.search('we'));
      act(() => result.current.search('wel'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith('/url?q=wel');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a search before the picker is opened (nothing to narrow)', () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiClient.get).mockResolvedValue([]);
      const { result } = renderHook(() => useBindingRoster('/url'));

      act(() => result.current.search('foo'));
      expect(result.current.query).toBe('foo');
      vi.advanceTimersByTime(300);
      expect(apiClient.get).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a stale in-flight response so the newest query wins', async () => {
    vi.useFakeTimers();
    try {
      const resolvers: Array<(v: unknown) => void> = [];
      vi.mocked(apiClient.get).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );
      const { result } = renderHook(() => useBindingRoster<{ id: string }>('/url'));

      // Open (request 0) then re-query (request 1) before either resolves.
      await act(async () => {
        void result.current.load();
      });
      act(() => result.current.search('foo'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(resolvers).toHaveLength(2);

      // Resolve the NEWER request first, then the older one.
      await act(async () => {
        resolvers[1]([{ id: 'new' }]);
      });
      await act(async () => {
        resolvers[0]([{ id: 'stale' }]);
      });

      // The stale (request 0) response must not overwrite the newer (request 1) one.
      expect(result.current.roster).toEqual([{ id: 'new' }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

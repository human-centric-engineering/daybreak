/**
 * Unit tests: GET /api/v1/admin/framework/modules/:slug/stats (f-engagement t-3).
 *
 * The admin stats endpoint. Mocks admin auth, the module-exists guard, and the stats query;
 * asserts the happy path returns the stats, an unknown module 404s before querying, and the
 * route is admin-guarded.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/v1/admin/framework/modules/[slug]/stats/route';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/framework/modules/queries', () => ({ moduleExists: vi.fn() }));
vi.mock('@/lib/framework/engagement/stats', () => ({ getModuleStats: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { moduleExists } from '@/lib/framework/modules/queries';
import { getModuleStats } from '@/lib/framework/engagement/stats';

const req = (): NextRequest =>
  ({
    headers: new Headers(),
    url: 'http://localhost/api/v1/admin/framework/modules/onboarding/stats',
    signal: new AbortController().signal,
  }) as unknown as NextRequest;

const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });

const STATS = {
  moduleSlug: 'onboarding',
  uniqueUsers: 3,
  entries: 10,
  completions: 4,
  returningUsers: 2,
  dwell: { medianMs: 120_000, sampleCount: 5 },
  feedback: { count: 1, averageRating: 5, distribution: {}, recentComments: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
    session: { id: 's1' },
  } as never);
  vi.mocked(moduleExists).mockResolvedValue(true);
  vi.mocked(getModuleStats).mockResolvedValue(STATS);
});

describe('GET module stats', () => {
  it('returns the module stats for an admin', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: STATS });
    expect(getModuleStats).toHaveBeenCalledWith('onboarding');
  });

  it('404s an unknown module before querying stats', async () => {
    vi.mocked(moduleExists).mockResolvedValue(false);
    const res = await GET(req(), ctx('ghost'));
    expect(res.status).toBe(404);
    expect(getModuleStats).not.toHaveBeenCalled();
  });

  it('403s a non-admin session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', role: 'USER' },
      session: { id: 's1' },
    } as never);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getModuleStats).not.toHaveBeenCalled();
  });
});

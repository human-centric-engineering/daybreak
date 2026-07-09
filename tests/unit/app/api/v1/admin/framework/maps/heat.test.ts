/**
 * Unit tests: GET /api/v1/admin/framework/maps/:slug/heat (f-engagement-analytics t-1).
 *
 * The admin map-heat endpoint. Mocks admin auth, the map-exists guard, and the heat query;
 * asserts the happy path returns the heat, an unknown map 404s before querying, and the
 * route is admin-guarded.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/v1/admin/framework/maps/[slug]/heat/route';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/framework/facilitation/map/queries', () => ({ graphExists: vi.fn() }));
vi.mock('@/lib/framework/engagement/map-heat', () => ({ getMapHeat: vi.fn() }));

import { auth } from '@/lib/auth/config';
import { graphExists } from '@/lib/framework/facilitation/map/queries';
import { getMapHeat } from '@/lib/framework/engagement/map-heat';

const req = (): NextRequest =>
  ({
    headers: new Headers(),
    url: 'http://localhost/api/v1/admin/framework/maps/onboarding/heat',
    signal: new AbortController().signal,
  }) as unknown as NextRequest;

const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });

const HEAT = {
  graphSlug: 'onboarding',
  nodes: [
    {
      nodeKey: 'intro',
      distinctUsers: 2,
      entries: 3,
      completions: 1,
      enteredUsers: 2,
      completedUsers: 1,
      dropOff: 1,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'admin-1', role: 'ADMIN' },
    session: { id: 's1' },
  } as never);
  vi.mocked(graphExists).mockResolvedValue(true);
  vi.mocked(getMapHeat).mockResolvedValue(HEAT);
});

describe('GET map heat', () => {
  it('returns the collective map heat for an admin', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: HEAT });
    expect(getMapHeat).toHaveBeenCalledWith('onboarding');
  });

  it('404s an unknown map before querying heat', async () => {
    vi.mocked(graphExists).mockResolvedValue(false);
    const res = await GET(req(), ctx('ghost'));
    expect(res.status).toBe(404);
    expect(getMapHeat).not.toHaveBeenCalled();
  });

  it('403s a non-admin session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', role: 'USER' },
      session: { id: 's1' },
    } as never);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getMapHeat).not.toHaveBeenCalled();
  });
});

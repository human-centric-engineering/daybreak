/**
 * Integration tests — framework journey detail API (f-ops-views t-5a).
 *
 * The HTTP contract over `getJourneyDetailForAdmin`: admin-guarded, the `[journeyId]`
 * cuid validated (malformed ⇒ 400), the explicit `isAdminSupport: true` viewer built
 * from the session, a missing journey ⇒ 404, an access-denied read ⇒ 403 (the gated
 * primitive throws `ForbiddenError`, mapped by the guard), and the standard envelope.
 * The enrichment read is mocked (its behaviour is proven in tests/integration/lib/*).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const q = vi.hoisted(() => ({ getJourneyDetailForAdmin: vi.fn() }));

vi.mock('@/lib/framework/facilitation/journey/admin-queries', () => ({
  getJourneyDetailForAdmin: q.getJourneyDetailForAdmin,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/journeys/[journeyId]/route';
import { auth } from '@/lib/auth/config';
import { ForbiddenError } from '@/lib/api/errors';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

function req(): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/framework/journeys/${CUID}`, {
    method: 'GET',
  });
}
const ctx = (journeyId = CUID) => ({ params: Promise.resolve({ journeyId }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());

const DETAIL = {
  journey: {
    id: CUID,
    userId: 'user_alice',
    graphSlug: 'main',
    contextKey: '',
    startedAt: '2026-06-01T10:00:00.000Z',
  },
  graph: { name: 'Main Map', slug: 'main', structure: { nodes: [], edges: [] } },
  nodeStates: [],
  timeline: [],
};

describe('GET /journeys/[journeyId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the detail bundle and builds the explicit admin-support viewer', async () => {
    asAdmin();
    q.getJourneyDetailForAdmin.mockResolvedValue(DETAIL);

    const res = await route.GET(req(), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: DETAIL });
    expect(q.getJourneyDetailForAdmin).toHaveBeenCalledWith(
      { userId: mockAdminUser().user.id, isAdminSupport: true },
      CUID
    );
  });

  it('404s when the journey does not exist', async () => {
    asAdmin();
    q.getJourneyDetailForAdmin.mockResolvedValue(null);

    const res = await route.GET(req(), ctx());
    expect(res.status).toBe(404);
  });

  it('surfaces a ForbiddenError from the gated read as 403', async () => {
    asAdmin();
    q.getJourneyDetailForAdmin.mockRejectedValue(new ForbiddenError('nope'));

    const res = await route.GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('400s on a malformed journeyId without hitting the query', async () => {
    asAdmin();
    const res = await route.GET(req(), ctx('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(q.getJourneyDetailForAdmin).not.toHaveBeenCalled();
  });

  it('401s for an unauthenticated request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await route.GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(q.getJourneyDetailForAdmin).not.toHaveBeenCalled();
  });

  it('403s for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(q.getJourneyDetailForAdmin).not.toHaveBeenCalled();
  });
});

/**
 * Integration tests — framework journey explorer list API (f-ops-views t-5a).
 *
 * The HTTP contract over `listJourneysForAdmin`: admin-guarded, query params
 * validated, the **explicit `isAdminSupport: true` viewer** constructed from the
 * session (the load-bearing bit — an operator on this support surface reads other
 * users' journeys, and the seam must be told so explicitly, not via a role check),
 * the graphSlug filter forwarded, and the paginated envelope. The enrichment query
 * is mocked (its behaviour is proven in tests/integration/lib/framework/*).
 *
 * Mocks via `vi.hoisted`, so this test — under an `api/` path — never imports
 * `@/lib/framework` beyond the route itself and stays on the right side of X6.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const q = vi.hoisted(() => ({ listJourneysForAdmin: vi.fn() }));

vi.mock('@/lib/framework/facilitation/journey/admin-queries', () => ({
  listJourneysForAdmin: q.listJourneysForAdmin,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/journeys/route';
import { auth } from '@/lib/auth/config';

function req(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/framework/journeys${query}`, {
    method: 'GET',
  });
}
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());

const ITEM = {
  id: 'j1',
  userId: 'user_alice',
  graphSlug: 'main',
  contextKey: '',
  startedAt: '2026-06-01T10:00:00.000Z',
  graph: { name: 'Main Map', slug: 'main' },
  progress: { total: 4, completed: 3 },
};

describe('GET /journeys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a paginated list and builds the explicit admin-support viewer', async () => {
    asAdmin();
    q.listJourneysForAdmin.mockResolvedValue({ items: [ITEM], total: 1 });

    const res = await route.GET(req('?page=1&limit=10'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [ITEM],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    expect(q.listJourneysForAdmin).toHaveBeenCalledWith(
      { userId: mockAdminUser().user.id, isAdminSupport: true },
      { page: 1, limit: 10, graphSlug: undefined }
    );
  });

  it('forwards the graphSlug filter', async () => {
    asAdmin();
    q.listJourneysForAdmin.mockResolvedValue({ items: [], total: 0 });

    await route.GET(req('?graphSlug=onboarding'));
    expect(q.listJourneysForAdmin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ graphSlug: 'onboarding' })
    );
  });

  it('400s on an invalid limit without hitting the query', async () => {
    asAdmin();
    const res = await route.GET(req('?limit=0'));
    expect(res.status).toBe(400);
    expect(q.listJourneysForAdmin).not.toHaveBeenCalled();
  });

  it('401s for an unauthenticated request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await route.GET(req());
    expect(res.status).toBe(401);
    expect(q.listJourneysForAdmin).not.toHaveBeenCalled();
  });

  it('403s for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.GET(req());
    expect(res.status).toBe(403);
    expect(q.listJourneysForAdmin).not.toHaveBeenCalled();
  });
});

/**
 * Integration tests — framework slot-values read API (f-admin-surfaces t-1).
 *
 * The HTTP contract over `listSlotValueHeadsForAdmin`: admin-guarded, query params
 * validated, filters + `reveal` forwarded, the paginated envelope, and the
 * load-bearing security behaviour — a `reveal=true` read is **audited**
 * (`logAdminAction`) while a masked read is not. The masking itself is proven in the
 * admin-queries unit test; here the query is mocked.
 *
 * Mocks via `vi.hoisted`, so this test — under an `api/` path — never imports
 * `@/lib/framework` beyond the route itself, staying on the right side of X6.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const q = vi.hoisted(() => ({ listSlotValueHeadsForAdmin: vi.fn() }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));

vi.mock('@/lib/framework/data-slots/admin-queries', () => ({
  listSlotValueHeadsForAdmin: q.listSlotValueHeadsForAdmin,
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({
  logAdminAction: audit.logAdminAction,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/slot-values/route';
import { auth } from '@/lib/auth/config';

function req(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/v1/admin/framework/slot-values${query}`, {
    method: 'GET',
  });
}
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());

const ITEM = {
  id: 'v1',
  userId: 'user_alice',
  slotSlug: 'primary_goal',
  version: 1,
  value: 'run a marathon',
  valueJson: null,
  confidence: 8,
  sourceType: 'direct',
  sensitivity: 'standard',
  masked: false,
  capturedAt: '2026-06-01T10:00:00.000Z',
};

describe('GET /slot-values', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a paginated list and forwards filters (reveal false, no audit)', async () => {
    asAdmin();
    q.listSlotValueHeadsForAdmin.mockResolvedValue({ items: [ITEM], total: 1 });

    const res = await route.GET(req('?page=1&limit=10&slotSlug=primary_goal&userId=user_alice'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [ITEM],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    expect(q.listSlotValueHeadsForAdmin).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      slotSlug: 'primary_goal',
      userId: 'user_alice',
      reveal: false,
    });
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it('audits a reveal read', async () => {
    asAdmin();
    q.listSlotValueHeadsForAdmin.mockResolvedValue({ items: [ITEM], total: 1 });

    const res = await route.GET(req('?slotSlug=health_note&reveal=true'));

    expect(res.status).toBe(200);
    expect(q.listSlotValueHeadsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ slotSlug: 'health_note', reveal: true })
    );
    expect(audit.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'framework.slot_values.reveal',
        entityType: 'slot_value',
        userId: mockAdminUser().user.id,
        metadata: expect.objectContaining({ slotSlug: 'health_note', count: 1 }),
      })
    );
  });

  it('treats reveal=false explicitly as not a reveal (no audit)', async () => {
    asAdmin();
    q.listSlotValueHeadsForAdmin.mockResolvedValue({ items: [], total: 0 });

    await route.GET(req('?reveal=false'));

    expect(q.listSlotValueHeadsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ reveal: false })
    );
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it('400s on an invalid limit without hitting the query', async () => {
    asAdmin();
    const res = await route.GET(req('?limit=0'));
    expect(res.status).toBe(400);
    expect(q.listSlotValueHeadsForAdmin).not.toHaveBeenCalled();
  });

  it('401s for an unauthenticated request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await route.GET(req());
    expect(res.status).toBe(401);
    expect(q.listSlotValueHeadsForAdmin).not.toHaveBeenCalled();
  });

  it('403s for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.GET(req());
    expect(res.status).toBe(403);
    expect(q.listSlotValueHeadsForAdmin).not.toHaveBeenCalled();
  });
});

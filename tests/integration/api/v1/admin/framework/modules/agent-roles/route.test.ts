/**
 * Integration test — framework module agent-roles admin API (f-ops-views t-4a).
 *
 * The HTTP contract over `getModuleAgentRoles`: admin-guarded, slug validated, the declared
 * seats returned in the standard envelope, a 404 surfaced for an unknown module. The query's
 * behaviour (registry read, registered flag) is proven in tests/integration/lib/framework/*.
 *
 * Mocks via `vi.hoisted`; under an `api/` path this never imports `@/lib/framework` beyond
 * the route itself (X6).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({ getModuleAgentRoles: vi.fn() }));
vi.mock('@/lib/framework/modules/bindings/queries', () => ({
  getModuleAgentRoles: svc.getModuleAgentRoles,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/modules/[slug]/agent-roles/route';
import { auth } from '@/lib/auth/config';
import { NotFoundError } from '@/lib/api/errors';

const URL = 'http://localhost/api/v1/admin/framework/modules/onboarding/agent-roles';
const req = () => new NextRequest(URL, { method: 'GET' });
const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());

describe('GET /modules/[slug]/agent-roles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the declared seats for an admin', async () => {
    asAdmin();
    svc.getModuleAgentRoles.mockResolvedValue({ registered: true, roles: ['companion'] });

    const res = await route.GET(req(), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: { registered: true, roles: ['companion'] } });
    expect(svc.getModuleAgentRoles).toHaveBeenCalledWith('onboarding');
  });

  it('surfaces a NotFoundError as 404', async () => {
    asAdmin();
    svc.getModuleAgentRoles.mockRejectedValue(new NotFoundError('Module "ghost" not found'));

    const res = await route.GET(req(), ctx('ghost'));
    expect(res.status).toBe(404);
  });

  it('400s on a malformed slug without hitting the query', async () => {
    asAdmin();
    const res = await route.GET(req(), ctx('Not A Slug'));
    expect(res.status).toBe(400);
    expect(svc.getModuleAgentRoles).not.toHaveBeenCalled();
  });

  it('401s for an unauthenticated request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await route.GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(svc.getModuleAgentRoles).not.toHaveBeenCalled();
  });

  it('403s for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.GET(req(), ctx());
    expect(res.status).toBe(403);
  });
});

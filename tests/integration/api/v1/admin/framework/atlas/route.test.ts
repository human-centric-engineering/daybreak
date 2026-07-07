/**
 * Integration tests — framework atlas composition API (f-atlas t-1).
 *
 * The HTTP contract over `assembleComposition`: admin-guarded, and the normalized projection
 * returned in the success envelope. The assembly is mocked (its behaviour is proven in
 * tests/integration/lib/framework/atlas/*); this pins the guard + envelope.
 *
 * Mocks via `vi.hoisted`, so this test — under an `api/` path — never imports `@/lib/framework`
 * beyond the route itself and stays on the right side of the X6 boundary.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const a = vi.hoisted(() => ({ assembleComposition: vi.fn() }));

vi.mock('@/lib/framework/atlas/assemble', () => ({ assembleComposition: a.assembleComposition }));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/atlas/route';
import { auth } from '@/lib/auth/config';

const req = (): NextRequest =>
  new NextRequest('http://localhost/api/v1/admin/framework/atlas', { method: 'GET' });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());

const PROJECTION = {
  modules: [{ id: 'reading' }],
  facilitation: { seats: [], policies: [] },
  agents: [],
  workflows: [],
  slots: [],
  capabilities: [],
  knowledge: [],
  maps: [],
  edges: [],
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/admin/framework/atlas', () => {
  it('returns the composition projection for an admin', async () => {
    asAdmin();
    a.assembleComposition.mockResolvedValue(PROJECTION);

    const res = await route.GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(PROJECTION);
    expect(a.assembleComposition).toHaveBeenCalledTimes(1);
  });

  it('rejects an unauthenticated caller and never assembles', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await route.GET(req());
    expect(res.status).toBe(401);
    expect(a.assembleComposition).not.toHaveBeenCalled();
  });

  it('rejects a non-admin caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.GET(req());
    expect(res.status).toBe(403);
    expect(a.assembleComposition).not.toHaveBeenCalled();
  });
});

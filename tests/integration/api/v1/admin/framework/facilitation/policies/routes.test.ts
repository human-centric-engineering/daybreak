/**
 * Integration tests — framework facilitation policy admin API (f-policies t-1).
 *
 * The HTTP contract over the policy service/queries: admin-guarded, bodies/params validated, the
 * right function called with the mapped args, the standard envelope/status returned. The service +
 * queries are mocked (their behaviour is proven against a fake in
 * tests/integration/lib/framework/facilitation/policies/*). Mocks via `vi.hoisted`, so this
 * `api/`-path test never imports `@/lib/framework` (X6 boundary).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/lib/api/errors';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  createFacilitationPolicy: vi.fn(),
  updateFacilitationPolicy: vi.fn(),
  deleteFacilitationPolicy: vi.fn(),
  listFacilitationPolicies: vi.fn(),
}));

vi.mock('@/lib/framework/facilitation/policies/policy-service', () => ({
  createFacilitationPolicy: svc.createFacilitationPolicy,
  updateFacilitationPolicy: svc.updateFacilitationPolicy,
  deleteFacilitationPolicy: svc.deleteFacilitationPolicy,
}));
vi.mock('@/lib/framework/facilitation/policies/policy-queries', () => ({
  listFacilitationPolicies: svc.listFacilitationPolicies,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as listRoute from '@/app/api/v1/admin/framework/facilitation/policies/route';
import * as policyRoute from '@/app/api/v1/admin/framework/facilitation/policies/[policyId]/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/policies';
const POLICY_ID = 'cjld2cyuq0000qzrmabcdef12';

function req(method: string, body?: unknown, url = BASE): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const ctx = (policyId: string) => ({ params: Promise.resolve({ policyId }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

const policyRow = {
  id: POLICY_ID,
  kind: 'auto_approval',
  enabled: true,
  payload: { autoApprove: 'none' },
};

beforeEach(() => {
  vi.clearAllMocks();
  asAdmin();
  svc.createFacilitationPolicy.mockResolvedValue(policyRow);
  svc.updateFacilitationPolicy.mockResolvedValue(policyRow);
  svc.deleteFacilitationPolicy.mockResolvedValue(undefined);
  svc.listFacilitationPolicies.mockResolvedValue([policyRow]);
});

describe('GET /facilitation/policies', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await listRoute.GET(req('GET'));
    expect(res.status).toBe(401);
  });

  it('lists policies', async () => {
    const res = await listRoute.GET(req('GET'));
    expect(res.status).toBe(200);
    const body = await parse<{ data: unknown[] }>(res);
    expect(body.data).toEqual([policyRow]);
    expect(svc.listFacilitationPolicies).toHaveBeenCalledWith(undefined);
  });

  it('passes the kind filter through', async () => {
    await listRoute.GET(req('GET', undefined, `${BASE}?kind=auto_approval`));
    expect(svc.listFacilitationPolicies).toHaveBeenCalledWith('auto_approval');
  });
});

describe('POST /facilitation/policies', () => {
  it('creates a policy and returns 201', async () => {
    const res = await listRoute.POST(
      req('POST', { kind: 'auto_approval', payload: { autoApprove: 'none' } })
    );
    expect(res.status).toBe(201);
    expect(svc.createFacilitationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'auto_approval',
        payload: { autoApprove: 'none' },
        userId: expect.any(String),
      })
    );
  });

  it('400s a missing kind (body validation)', async () => {
    const res = await listRoute.POST(req('POST', { payload: {} }));
    expect(res.status).toBe(400);
    expect(svc.createFacilitationPolicy).not.toHaveBeenCalled();
  });

  it('surfaces the service ValidationError (bad payload) as 400', async () => {
    svc.createFacilitationPolicy.mockRejectedValue(new ValidationError('bad payload'));
    const res = await listRoute.POST(
      req('POST', { kind: 'auto_approval', payload: { autoApprove: 'x' } })
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /facilitation/policies/[policyId]', () => {
  it('updates a policy', async () => {
    const res = await policyRoute.PATCH(req('PATCH', { enabled: false }), ctx(POLICY_ID));
    expect(res.status).toBe(200);
    expect(svc.updateFacilitationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: POLICY_ID, enabled: false })
    );
  });

  it('400s an empty body (nothing to update)', async () => {
    const res = await policyRoute.PATCH(req('PATCH', {}), ctx(POLICY_ID));
    expect(res.status).toBe(400);
    expect(svc.updateFacilitationPolicy).not.toHaveBeenCalled();
  });

  it('400s a malformed policyId', async () => {
    const res = await policyRoute.PATCH(req('PATCH', { enabled: true }), ctx('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(svc.updateFacilitationPolicy).not.toHaveBeenCalled();
  });
});

describe('DELETE /facilitation/policies/[policyId]', () => {
  it('deletes a policy', async () => {
    const res = await policyRoute.DELETE(req('DELETE'), ctx(POLICY_ID));
    expect(res.status).toBe(200);
    expect(svc.deleteFacilitationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: POLICY_ID })
    );
  });
});

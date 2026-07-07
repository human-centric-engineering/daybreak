/**
 * Integration tests — framework structure-change proposal admin API (f-emergence t-3).
 *
 * The HTTP contract over the emergence services: admin-guarded, bodies/params validated, the right
 * function called with the mapped args, the standard envelope/status. The services are mocked (their
 * behaviour is proven in tests/integration/lib/framework/facilitation/emergence/*). Mocks via
 * `vi.hoisted`, so this `api/`-path test never imports `@/lib/framework` (X6 boundary).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/lib/api/errors';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  submit: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  getAutoApproveMode: vi.fn(),
  isAutoApprovable: vi.fn(),
}));

vi.mock('@/lib/framework/facilitation/emergence/proposal-service', () => ({
  submitStructureChangeProposal: svc.submit,
  listStructureChangeProposals: svc.list,
  getStructureChangeProposal: svc.get,
}));
vi.mock('@/lib/framework/facilitation/emergence/approval', () => ({
  approveProposal: svc.approve,
  rejectProposal: svc.reject,
}));
vi.mock('@/lib/framework/facilitation/emergence/auto-approve', () => ({
  getAutoApproveMode: svc.getAutoApproveMode,
  isAutoApprovable: svc.isAutoApprovable,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as listRoute from '@/app/api/v1/admin/framework/facilitation/proposals/route';
import * as detailRoute from '@/app/api/v1/admin/framework/facilitation/proposals/[proposalId]/route';
import * as approveRoute from '@/app/api/v1/admin/framework/facilitation/proposals/[proposalId]/approve/route';
import * as rejectRoute from '@/app/api/v1/admin/framework/facilitation/proposals/[proposalId]/reject/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/proposals';
const PID = 'cjld2cyuq0000qzrmabcdef12';

function req(method: string, body?: unknown, url = BASE): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const ctx = (proposalId: string) => ({ params: Promise.resolve({ proposalId }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

const row = {
  id: PID,
  subjectType: 'map',
  subjectId: 'g',
  status: 'pending',
  riskClass: 'unclassified',
};

beforeEach(() => {
  vi.clearAllMocks();
  asAdmin();
  svc.submit.mockResolvedValue(row);
  svc.list.mockResolvedValue([row]);
  svc.get.mockResolvedValue(row);
  svc.approve.mockResolvedValue({ ...row, status: 'published' });
  svc.reject.mockResolvedValue({ ...row, status: 'rejected' });
  svc.getAutoApproveMode.mockResolvedValue('none');
  svc.isAutoApprovable.mockReturnValue(false);
});

describe('GET /proposals', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await listRoute.GET(req('GET'))).status).toBe(401);
  });

  it('lists proposals with filters', async () => {
    const res = await listRoute.GET(
      req('GET', undefined, `${BASE}?status=pending&subjectType=map`)
    );
    expect(res.status).toBe(200);
    expect(svc.list).toHaveBeenCalledWith({
      subjectType: 'map',
      subjectId: undefined,
      status: 'pending',
    });
    expect((await parse<{ data: unknown[] }>(res)).data).toEqual([row]);
  });
});

describe('POST /proposals', () => {
  it('submits a proposal (author = session admin) and returns 201 pending', async () => {
    const res = await listRoute.POST(
      req('POST', { subjectType: 'map', subjectId: 'g', proposedDefinition: { nodes: [] } })
    );
    expect(res.status).toBe(201);
    expect(svc.submit).toHaveBeenCalledWith(
      expect.objectContaining({ subjectType: 'map', subjectId: 'g', createdBy: expect.any(String) })
    );
    expect(svc.approve).not.toHaveBeenCalled(); // auto-approve inert in v1
  });

  it('records agent authorship when authorAgentSlug is given', async () => {
    await listRoute.POST(
      req('POST', {
        subjectType: 'map',
        subjectId: 'g',
        proposedDefinition: {},
        authorAgentSlug: 'onboarding',
      })
    );
    expect(svc.submit).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'agent:onboarding' })
    );
  });

  it('auto-approves when eligible (future taxonomy path)', async () => {
    svc.isAutoApprovable.mockReturnValue(true);
    await listRoute.POST(
      req('POST', { subjectType: 'map', subjectId: 'g', proposedDefinition: {} })
    );
    expect(svc.approve).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: PID, reviewedBy: null })
    );
  });

  it('400s a non-map subjectType (body validation)', async () => {
    const res = await listRoute.POST(req('POST', { subjectType: 'policy', subjectId: 'g' }));
    expect(res.status).toBe(400);
    expect(svc.submit).not.toHaveBeenCalled();
  });
});

describe('GET /proposals/[id]', () => {
  it('returns a proposal', async () => {
    const res = await detailRoute.GET(req('GET'), ctx(PID));
    expect(res.status).toBe(200);
    expect(svc.get).toHaveBeenCalledWith(PID);
  });

  it('400s a malformed id', async () => {
    const res = await detailRoute.GET(req('GET'), ctx('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(svc.get).not.toHaveBeenCalled();
  });
});

describe('POST /proposals/[id]/approve', () => {
  it('approves + publishes', async () => {
    const res = await approveRoute.POST(req('POST'), ctx(PID));
    expect(res.status).toBe(200);
    expect(svc.approve).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: PID, reviewedBy: expect.any(String) })
    );
  });

  it('surfaces a conflict ValidationError as 400', async () => {
    svc.approve.mockRejectedValue(new ValidationError('map changed'));
    expect((await approveRoute.POST(req('POST'), ctx(PID))).status).toBe(400);
  });
});

describe('POST /proposals/[id]/reject', () => {
  it('rejects with a reason', async () => {
    const res = await rejectRoute.POST(req('POST', { reason: 'off-scope' }), ctx(PID));
    expect(res.status).toBe(200);
    expect(svc.reject).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: PID, reason: 'off-scope' })
    );
  });

  it('400s a missing reason', async () => {
    const res = await rejectRoute.POST(req('POST', {}), ctx(PID));
    expect(res.status).toBe(400);
    expect(svc.reject).not.toHaveBeenCalled();
  });
});

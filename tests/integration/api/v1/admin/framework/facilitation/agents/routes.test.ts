/**
 * Integration tests — framework facilitation agent-binding admin API
 * (f-facilitation-agents t-1).
 *
 * The HTTP contract over the binding service/queries: admin-guarded, bodies/params validated,
 * the right function called with the mapped args, the standard envelope/status returned. The
 * service + queries are mocked (their behaviour is proven against a fake in
 * tests/integration/lib/framework/facilitation/agents/*). Mocks via `vi.hoisted`, so this
 * `api/`-path test never imports `@/lib/framework` (X6 boundary).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/lib/api/errors';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  bindFacilitationAgent: vi.fn(),
  updateFacilitationBinding: vi.fn(),
  unbindFacilitationAgent: vi.fn(),
  listFacilitationBindings: vi.fn(),
}));

vi.mock('@/lib/framework/facilitation/agents/binding-service', () => ({
  bindFacilitationAgent: svc.bindFacilitationAgent,
  updateFacilitationBinding: svc.updateFacilitationBinding,
  unbindFacilitationAgent: svc.unbindFacilitationAgent,
}));
vi.mock('@/lib/framework/facilitation/agents/binding-queries', () => ({
  listFacilitationBindings: svc.listFacilitationBindings,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as listRoute from '@/app/api/v1/admin/framework/facilitation/agents/route';
import * as bindingRoute from '@/app/api/v1/admin/framework/facilitation/agents/[bindingId]/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/agents';
const AGENT_ID = 'cjld2cjxh0000qzrmn831i7rn';
const BINDING_ID = 'cjld2cyuq0000qzrmabcdef12';

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(BASE, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const ctxBinding = (bindingId: string) => ({ params: Promise.resolve({ bindingId }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

const bindingRow = { id: BINDING_ID, agentId: AGENT_ID, role: 'onboarding' };

beforeEach(() => {
  vi.clearAllMocks();
  asAdmin();
  svc.bindFacilitationAgent.mockResolvedValue(bindingRow);
  svc.listFacilitationBindings.mockResolvedValue([bindingRow]);
});

describe('GET /facilitation/agents', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await listRoute.GET(req('GET'));
    expect(res.status).toBe(401);
  });

  it('lists the facilitation bindings', async () => {
    const res = await listRoute.GET(req('GET'));
    expect(res.status).toBe(200);
    const body = await parse<{ data: unknown[] }>(res);
    expect(body.data).toEqual([bindingRow]);
  });
});

describe('POST /facilitation/agents', () => {
  it('binds an agent and returns 201', async () => {
    const res = await listRoute.POST(req('POST', { agentId: AGENT_ID, role: 'onboarding' }));
    expect(res.status).toBe(201);
    expect(svc.bindFacilitationAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: AGENT_ID, role: 'onboarding', userId: expect.any(String) })
    );
  });

  it('400s a missing role (body validation)', async () => {
    const res = await listRoute.POST(req('POST', { agentId: AGENT_ID }));
    expect(res.status).toBe(400);
    expect(svc.bindFacilitationAgent).not.toHaveBeenCalled();
  });

  it('surfaces the service ValidationError (bad seat) as 400', async () => {
    svc.bindFacilitationAgent.mockRejectedValue(new ValidationError('bad seat'));
    const res = await listRoute.POST(req('POST', { agentId: AGENT_ID, role: 'made_up' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /facilitation/agents/[bindingId]', () => {
  it('updates the config', async () => {
    svc.updateFacilitationBinding.mockResolvedValue(bindingRow);
    const res = await bindingRoute.PATCH(
      req('PATCH', { config: { tone: 'warm' } }),
      ctxBinding(BINDING_ID)
    );
    expect(res.status).toBe(200);
    expect(svc.updateFacilitationBinding).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: BINDING_ID, config: { tone: 'warm' } })
    );
  });

  it('400s a malformed bindingId', async () => {
    const res = await bindingRoute.PATCH(req('PATCH', { config: null }), ctxBinding('not-a-cuid'));
    expect(res.status).toBe(400);
    expect(svc.updateFacilitationBinding).not.toHaveBeenCalled();
  });
});

describe('DELETE /facilitation/agents/[bindingId]', () => {
  it('unbinds', async () => {
    svc.unbindFacilitationAgent.mockResolvedValue(undefined);
    const res = await bindingRoute.DELETE(req('DELETE'), ctxBinding(BINDING_ID));
    expect(res.status).toBe(200);
    expect(svc.unbindFacilitationAgent).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: BINDING_ID })
    );
  });
});

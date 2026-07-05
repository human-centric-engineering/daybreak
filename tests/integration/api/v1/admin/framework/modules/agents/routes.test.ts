/**
 * Integration tests — framework module agent-binding admin API
 * (f-module-bindings t-1).
 *
 * The HTTP contract over the binding service/queries: every route is admin-guarded,
 * bodies/params are validated, the right function is called with the mapped args,
 * and the standard envelope / status is returned. The service + queries are mocked
 * (their behaviour is proven against a stateful fake in
 * tests/integration/lib/framework/modules/bindings/*) — here we pin the route layer.
 *
 * The mocks are created via `vi.hoisted` and referenced directly, so this test —
 * under an `api/` path, not a framework-tier `lib/framework` path — never *imports*
 * `@/lib/framework` and stays on the right side of the X6 boundary.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  bindAgent: vi.fn(),
  updateBinding: vi.fn(),
  unbindAgent: vi.fn(),
  listModuleBindings: vi.fn(),
}));

vi.mock('@/lib/framework/modules/bindings/service', () => ({
  bindAgent: svc.bindAgent,
  updateBinding: svc.updateBinding,
  unbindAgent: svc.unbindAgent,
}));
vi.mock('@/lib/framework/modules/bindings/queries', () => ({
  listModuleBindings: svc.listModuleBindings,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as listRoute from '@/app/api/v1/admin/framework/modules/[slug]/agents/route';
import * as bindingRoute from '@/app/api/v1/admin/framework/modules/[slug]/agents/[bindingId]/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/modules';
const AGENT_ID = 'cjld2cjxh0000qzrmn831i7rn';
const BINDING_ID = 'cjld2cyuq0000qzrmabcdef12';

function req(method: string, body?: unknown, url = BASE): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const ctx2 = (slug: string, bindingId: string) => ({
  params: Promise.resolve({ slug, bindingId }),
});
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}
const validBind = { agentId: AGENT_ID, role: 'companion' };
const bindingRow = {
  id: BINDING_ID,
  moduleId: 'm1',
  agentId: AGENT_ID,
  role: 'companion',
  isPrimary: false,
};

beforeEach(() => vi.clearAllMocks());

describe('admin guard — every route', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['GET /agents', () => listRoute.GET(req('GET'), ctx('reading'))],
    ['POST /agents', () => listRoute.POST(req('POST', validBind), ctx('reading'))],
    [
      'PATCH /agents/:id',
      () => bindingRoute.PATCH(req('PATCH', { isPrimary: true }), ctx2('reading', BINDING_ID)),
    ],
    ['DELETE /agents/:id', () => bindingRoute.DELETE(req('DELETE'), ctx2('reading', BINDING_ID))],
  ];

  it.each(routes)('%s returns 401 when unauthenticated', async (_name, invoke) => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await invoke()).status).toBe(401);
  });

  it('does not touch the service for an unauthorized caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    await listRoute.POST(req('POST', validBind), ctx('reading'));
    expect(svc.bindAgent).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser('USER'));
    expect((await listRoute.GET(req('GET'), ctx('reading'))).status).toBe(403);
  });
});

describe('GET /modules/:slug/agents', () => {
  it('returns the bindings in the envelope', async () => {
    asAdmin();
    svc.listModuleBindings.mockResolvedValue([
      { ...bindingRow, agent: { id: AGENT_ID, name: 'A' } },
    ]);
    const res = await listRoute.GET(req('GET'), ctx('reading'));
    expect(res.status).toBe(200);
    expect(svc.listModuleBindings).toHaveBeenCalledWith('reading');
    const body = await parse<{ success: boolean; data: unknown[] }>(res);
    expect(body).toMatchObject({ success: true, data: [{ role: 'companion' }] });
  });

  it('returns [] on the empty state', async () => {
    asAdmin();
    svc.listModuleBindings.mockResolvedValue([]);
    const body = await parse<{ data: unknown[] }>(await listRoute.GET(req('GET'), ctx('reading')));
    expect(body.data).toEqual([]);
  });

  it('rejects a malformed slug with 400 (not 404), service untouched', async () => {
    asAdmin();
    const res = await listRoute.GET(req('GET'), ctx('BAD SLUG'));
    expect(res.status).toBe(400);
    expect(svc.listModuleBindings).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError (unknown module) as 404', async () => {
    asAdmin();
    svc.listModuleBindings.mockRejectedValue(new NotFoundError('nope'));
    expect((await listRoute.GET(req('GET'), ctx('ghost'))).status).toBe(404);
  });
});

describe('POST /modules/:slug/agents', () => {
  it('binds an agent (201) and forwards the mapped args', async () => {
    asAdmin();
    svc.bindAgent.mockResolvedValue(bindingRow);
    const res = await listRoute.POST(
      req('POST', {
        agentId: AGENT_ID,
        role: 'companion',
        isPrimary: true,
        config: { tone: 'warm' },
      }),
      ctx('reading')
    );
    expect(res.status).toBe(201);
    expect(svc.bindAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleSlug: 'reading',
        agentId: AGENT_ID,
        role: 'companion',
        isPrimary: true,
        config: { tone: 'warm' },
      })
    );
  });

  it('rejects a missing role before calling the service (400)', async () => {
    asAdmin();
    const res = await listRoute.POST(req('POST', { agentId: AGENT_ID }), ctx('reading'));
    expect(res.status).toBe(400);
    expect(svc.bindAgent).not.toHaveBeenCalled();
  });

  it('rejects a non-cuid agentId (400)', async () => {
    asAdmin();
    expect(
      (
        await listRoute.POST(
          req('POST', { agentId: 'not-a-cuid', role: 'companion' }),
          ctx('reading')
        )
      ).status
    ).toBe(400);
  });

  it('maps a seat/duplicate ValidationError from the service to 400', async () => {
    asAdmin();
    svc.bindAgent.mockRejectedValue(new ValidationError('bad seat'));
    expect((await listRoute.POST(req('POST', validBind), ctx('reading'))).status).toBe(400);
  });

  it('maps a NotFoundError (unregistered module) to 404', async () => {
    asAdmin();
    svc.bindAgent.mockRejectedValue(new NotFoundError('unregistered'));
    expect((await listRoute.POST(req('POST', validBind), ctx('reading'))).status).toBe(404);
  });
});

describe('PATCH /modules/:slug/agents/:bindingId', () => {
  it('updates a binding and forwards the mapped args', async () => {
    asAdmin();
    svc.updateBinding.mockResolvedValue({ ...bindingRow, isPrimary: true });
    const res = await bindingRoute.PATCH(
      req('PATCH', { isPrimary: true, config: { note: 'x' } }),
      ctx2('reading', BINDING_ID)
    );
    expect(res.status).toBe(200);
    expect(svc.updateBinding).toHaveBeenCalledWith(
      expect.objectContaining({ moduleSlug: 'reading', bindingId: BINDING_ID, isPrimary: true })
    );
  });

  it('rejects an empty patch body (400)', async () => {
    asAdmin();
    const res = await bindingRoute.PATCH(req('PATCH', {}), ctx2('reading', BINDING_ID));
    expect(res.status).toBe(400);
    expect(svc.updateBinding).not.toHaveBeenCalled();
  });

  it('rejects a malformed bindingId (400)', async () => {
    asAdmin();
    const res = await bindingRoute.PATCH(
      req('PATCH', { isPrimary: true }),
      ctx2('reading', 'nope')
    );
    expect(res.status).toBe(400);
    expect(svc.updateBinding).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError (binding not in module) as 404', async () => {
    asAdmin();
    svc.updateBinding.mockRejectedValue(new NotFoundError('nope'));
    expect(
      (await bindingRoute.PATCH(req('PATCH', { isPrimary: true }), ctx2('reading', BINDING_ID)))
        .status
    ).toBe(404);
  });
});

describe('DELETE /modules/:slug/agents/:bindingId', () => {
  it('unbinds and returns the envelope', async () => {
    asAdmin();
    svc.unbindAgent.mockResolvedValue(undefined);
    const res = await bindingRoute.DELETE(req('DELETE'), ctx2('reading', BINDING_ID));
    expect(res.status).toBe(200);
    expect(svc.unbindAgent).toHaveBeenCalledWith(
      expect.objectContaining({ moduleSlug: 'reading', bindingId: BINDING_ID })
    );
    const body = await parse<{ data: { unbound: boolean } }>(res);
    expect(body.data.unbound).toBe(true);
  });

  it('propagates NotFoundError as 404', async () => {
    asAdmin();
    svc.unbindAgent.mockRejectedValue(new NotFoundError('nope'));
    expect((await bindingRoute.DELETE(req('DELETE'), ctx2('reading', BINDING_ID))).status).toBe(
      404
    );
  });
});

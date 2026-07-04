/**
 * Integration tests — framework map admin API (f-map t-3).
 *
 * The HTTP contract over the version service: every route is admin-guarded, bodies
 * are Zod-validated, the right service function is called with the mapped args, and
 * the standard envelope / status is returned. The service itself is mocked (its
 * behaviour is proven against a stateful fake in
 * tests/integration/lib/framework/facilitation/version-service.test.ts) — here we
 * pin the route layer.
 *
 * The service/queries mocks are created via `vi.hoisted` and referenced directly,
 * so this test — which lives under an `api/` path, not a framework-tier
 * `lib/framework` test path — never *imports* `@/lib/framework` and stays on the
 * right side of the X6 boundary.
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
  createGraph: vi.fn(),
  saveDraft: vi.fn(),
  discardDraft: vi.fn(),
  publishDraft: vi.fn(),
  rollback: vi.fn(),
  listVersions: vi.fn(),
  listGraphs: vi.fn(),
  getGraphDetail: vi.fn(),
}));

vi.mock('@/lib/framework/facilitation/map/version-service', () => ({
  createGraph: svc.createGraph,
  saveDraft: svc.saveDraft,
  discardDraft: svc.discardDraft,
  publishDraft: svc.publishDraft,
  rollback: svc.rollback,
  listVersions: svc.listVersions,
}));
vi.mock('@/lib/framework/facilitation/map/queries', () => ({
  listGraphs: svc.listGraphs,
  getGraphDetail: svc.getGraphDetail,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as listRoute from '@/app/api/v1/admin/framework/maps/route';
import * as detailRoute from '@/app/api/v1/admin/framework/maps/[slug]/route';
import * as publishRoute from '@/app/api/v1/admin/framework/maps/[slug]/publish/route';
import * as rollbackRoute from '@/app/api/v1/admin/framework/maps/[slug]/rollback/route';
import * as versionsRoute from '@/app/api/v1/admin/framework/maps/[slug]/versions/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/maps';

function req(method: string, body?: unknown, url = BASE): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}
/** A schema-valid raw map (the real create/patch schemas validate it). */
const validMap = { nodes: [{ key: 'start', type: 'milestone' }], edges: [] };
const graphRow = { id: 'g1', slug: 'main', name: 'Main', publishedVersionId: null };

beforeEach(() => vi.clearAllMocks());

describe('admin guard — every route', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['GET /maps', () => listRoute.GET(req('GET'))],
    ['POST /maps', () => listRoute.POST(req('POST', { slug: 'main', name: 'Main' }))],
    ['GET /maps/:slug', () => detailRoute.GET(req('GET'), ctx('main'))],
    ['PATCH /maps/:slug', () => detailRoute.PATCH(req('PATCH', { definition: null }), ctx('main'))],
    ['POST /maps/:slug/publish', () => publishRoute.POST(req('POST', {}), ctx('main'))],
    [
      'POST /maps/:slug/rollback',
      () => rollbackRoute.POST(req('POST', { targetVersion: 1 }), ctx('main')),
    ],
    ['GET /maps/:slug/versions', () => versionsRoute.GET(req('GET'), ctx('main'))],
  ];

  it.each(routes)('%s returns 401 when unauthenticated', async (_name, invoke) => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await invoke()).status).toBe(401);
  });

  it('does not touch the service for an unauthorized caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    await listRoute.POST(req('POST', { slug: 'main', name: 'Main' }));
    expect(svc.createGraph).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser('USER'));
    expect((await listRoute.GET(req('GET'))).status).toBe(403);
  });
});

describe('GET /maps', () => {
  it('returns the maps in the envelope', async () => {
    asAdmin();
    svc.listGraphs.mockResolvedValue([graphRow]);
    const res = await listRoute.GET(req('GET'));
    expect(res.status).toBe(200);
    const body = await parse<{ success: boolean; data: unknown[] }>(res);
    expect(body).toMatchObject({ success: true, data: [{ slug: 'main' }] });
  });

  it('returns [] on the clean-fork empty state', async () => {
    asAdmin();
    svc.listGraphs.mockResolvedValue([]);
    const body = await parse<{ data: unknown[] }>(await listRoute.GET(req('GET')));
    expect(body.data).toEqual([]);
  });
});

describe('POST /maps', () => {
  it('creates a map (201) and forwards the mapped args', async () => {
    asAdmin();
    svc.createGraph.mockResolvedValue(graphRow);
    const res = await listRoute.POST(
      req('POST', { slug: 'main', name: 'Main', description: 'D', definition: validMap })
    );
    expect(res.status).toBe(201);
    expect(svc.createGraph).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'main', name: 'Main', description: 'D' })
    );
  });

  it('rejects a missing name before calling the service (400)', async () => {
    asAdmin();
    const res = await listRoute.POST(req('POST', { slug: 'main' }));
    expect(res.status).toBe(400);
    expect(svc.createGraph).not.toHaveBeenCalled();
  });

  it('rejects a non-kebab slug (400)', async () => {
    asAdmin();
    expect((await listRoute.POST(req('POST', { slug: 'Not A Slug', name: 'X' }))).status).toBe(400);
  });

  it('maps a duplicate-slug ValidationError from the service to 400', async () => {
    asAdmin();
    svc.createGraph.mockRejectedValue(new ValidationError('slug in use'));
    expect((await listRoute.POST(req('POST', { slug: 'main', name: 'Main' }))).status).toBe(400);
  });
});

describe('GET /maps/:slug', () => {
  it('returns the map detail', async () => {
    asAdmin();
    svc.getGraphDetail.mockResolvedValue({ ...graphRow, publishedVersion: null });
    const res = await detailRoute.GET(req('GET'), ctx('main'));
    expect(res.status).toBe(200);
    expect(svc.getGraphDetail).toHaveBeenCalledWith('main');
  });

  it('propagates NotFoundError as 404', async () => {
    asAdmin();
    svc.getGraphDetail.mockRejectedValue(new NotFoundError('nope'));
    expect((await detailRoute.GET(req('GET'), ctx('ghost'))).status).toBe(404);
  });

  it('rejects a malformed slug param with 400 (not 404)', async () => {
    asAdmin();
    const res = await detailRoute.GET(req('GET'), ctx('BAD SLUG'));
    expect(res.status).toBe(400);
    expect(svc.getGraphDetail).not.toHaveBeenCalled();
  });
});

describe('PATCH /maps/:slug', () => {
  it('saves a draft when a definition is given', async () => {
    asAdmin();
    svc.saveDraft.mockResolvedValue(graphRow);
    await detailRoute.PATCH(req('PATCH', { definition: validMap }), ctx('main'));
    expect(svc.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ slug: 'main' }));
    expect(svc.discardDraft).not.toHaveBeenCalled();
  });

  it('discards the draft when definition is null', async () => {
    asAdmin();
    svc.discardDraft.mockResolvedValue(graphRow);
    await detailRoute.PATCH(req('PATCH', { definition: null }), ctx('main'));
    expect(svc.discardDraft).toHaveBeenCalledWith(expect.objectContaining({ slug: 'main' }));
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it('rejects a body missing the definition key (400)', async () => {
    asAdmin();
    expect((await detailRoute.PATCH(req('PATCH', {}), ctx('main'))).status).toBe(400);
  });
});

describe('POST /maps/:slug/publish', () => {
  it('publishes and returns the result envelope', async () => {
    asAdmin();
    svc.publishDraft.mockResolvedValue({ graph: graphRow, version: { id: 'v1', version: 1 } });
    const res = await publishRoute.POST(req('POST', { changeSummary: 'go' }), ctx('main'));
    expect(res.status).toBe(200);
    expect(svc.publishDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'main', changeSummary: 'go' })
    );
  });

  it('maps a "no draft" ValidationError to 400', async () => {
    asAdmin();
    svc.publishDraft.mockRejectedValue(new ValidationError('No draft to publish'));
    expect((await publishRoute.POST(req('POST', {}), ctx('main'))).status).toBe(400);
  });
});

describe('POST /maps/:slug/rollback', () => {
  it('rolls back by version number', async () => {
    asAdmin();
    svc.rollback.mockResolvedValue({ graph: graphRow, version: { id: 'v3', version: 3 } });
    const res = await rollbackRoute.POST(req('POST', { targetVersion: 1 }), ctx('main'));
    expect(res.status).toBe(200);
    expect(svc.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'main', targetVersion: 1 })
    );
  });

  it('rejects a missing / non-positive targetVersion (400)', async () => {
    asAdmin();
    expect((await rollbackRoute.POST(req('POST', {}), ctx('main'))).status).toBe(400);
    expect((await rollbackRoute.POST(req('POST', { targetVersion: 0 }), ctx('main'))).status).toBe(
      400
    );
    expect(svc.rollback).not.toHaveBeenCalled();
  });
});

describe('GET /maps/:slug/versions', () => {
  it('lists versions in the envelope', async () => {
    asAdmin();
    svc.listVersions.mockResolvedValue({ versions: [{ id: 'v1', version: 1 }], nextCursor: null });
    const res = await versionsRoute.GET(
      req('GET', undefined, `${BASE}/main/versions?limit=10`),
      ctx('main')
    );
    expect(res.status).toBe(200);
    expect(svc.listVersions).toHaveBeenCalledWith('main', expect.objectContaining({ limit: 10 }));
  });

  it('propagates NotFoundError (unknown map) as 404', async () => {
    asAdmin();
    svc.listVersions.mockRejectedValue(new NotFoundError('nope'));
    expect((await versionsRoute.GET(req('GET'), ctx('ghost'))).status).toBe(404);
  });
});

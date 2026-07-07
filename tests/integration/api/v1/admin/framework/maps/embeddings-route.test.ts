/**
 * Integration tests — framework map node-embeddings admin API (f-overlays t-1). Admin-guarded; the
 * right service/queries called with mapped args; the standard envelope/status. Services mocked via
 * `vi.hoisted`, so this `api/`-path test never imports `@/lib/framework` (X6 boundary).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({ sync: vi.fn(), getPublishedMap: vi.fn(), count: vi.fn() }));

vi.mock('@/lib/framework/facilitation/overlays/embed-sync', () => ({
  syncMapNodeEmbeddings: svc.sync,
}));
vi.mock('@/lib/framework/facilitation/map/version-service', () => ({
  getPublishedMap: svc.getPublishedMap,
}));
vi.mock('@/lib/framework/facilitation/overlays/queries', () => ({
  countNodeEmbeddings: svc.count,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/maps/[slug]/embeddings/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/maps/primary/embeddings';

function req(method: string): NextRequest {
  return new NextRequest(BASE, { method });
}
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}
const ctx = { params: Promise.resolve({ slug: 'primary' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
  svc.getPublishedMap.mockResolvedValue({
    slug: 'primary',
    version: 4,
    definition: { nodes: [], edges: [] },
  });
  svc.count.mockResolvedValue(12);
  svc.sync.mockResolvedValue({
    slug: 'primary',
    version: 4,
    nodeCount: 12,
    embeddedCount: 12,
    model: 'text-embedding-3-small',
    dimensions: 1536,
  });
});

describe('GET /maps/:slug/embeddings', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.GET(req('GET'), ctx)).status).toBe(401);
  });

  it('reports the embedded-node count for the published version', async () => {
    const res = await route.GET(req('GET'), ctx);
    expect(res.status).toBe(200);
    expect(svc.count).toHaveBeenCalledWith('primary', 4);
    expect(
      (await parse<{ data: { version: number; embeddedNodeCount: number } }>(res)).data
    ).toEqual({
      slug: 'primary',
      version: 4,
      embeddedNodeCount: 12,
    });
  });

  it('reports version null / count 0 when nothing is published', async () => {
    svc.getPublishedMap.mockResolvedValue(null);
    const res = await route.GET(req('GET'), ctx);
    expect(res.status).toBe(200);
    expect(svc.count).not.toHaveBeenCalled();
    expect((await parse<{ data: { version: null; embeddedNodeCount: number } }>(res)).data).toEqual(
      {
        slug: 'primary',
        version: null,
        embeddedNodeCount: 0,
      }
    );
  });
});

describe('POST /maps/:slug/embeddings', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.POST(req('POST'), ctx)).status).toBe(401);
    expect(svc.sync).not.toHaveBeenCalled();
  });

  it('syncs and returns 201 with the summary', async () => {
    const res = await route.POST(req('POST'), ctx);
    expect(res.status).toBe(201);
    expect(svc.sync).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'primary', actorUserId: expect.any(String) })
    );
    expect((await parse<{ data: { embeddedCount: number } }>(res)).data.embeddedCount).toBe(12);
  });

  it('surfaces an unpublished-map NotFoundError as 404', async () => {
    svc.sync.mockRejectedValue(new NotFoundError('no published version'));
    expect((await route.POST(req('POST'), ctx)).status).toBe(404);
  });
});

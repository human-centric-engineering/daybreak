/**
 * Integration tests — framework module knowledge-scope admin API
 * (f-module-bindings t-4).
 *
 * The HTTP contract over the knowledge service/queries: admin-guarded, bodies/query
 * validated (exactly one of document/tag), the right function called with mapped args,
 * standard envelope/status. The service + queries are mocked (their behaviour is proven
 * against a stateful fake in tests/integration/lib/framework/modules/knowledge/*).
 *
 * Mocks are created via `vi.hoisted` and referenced directly, so this test — under an
 * `api/` path — never imports `@/lib/framework` and stays on the right side of X6.
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
  grantModuleDocument: vi.fn(),
  grantModuleTag: vi.fn(),
  revokeModuleDocument: vi.fn(),
  revokeModuleTag: vi.fn(),
  listModuleKnowledge: vi.fn(),
}));

vi.mock('@/lib/framework/modules/knowledge/service', () => ({
  grantModuleDocument: svc.grantModuleDocument,
  grantModuleTag: svc.grantModuleTag,
  revokeModuleDocument: svc.revokeModuleDocument,
  revokeModuleTag: svc.revokeModuleTag,
}));
vi.mock('@/lib/framework/modules/knowledge/queries', () => ({
  listModuleKnowledge: svc.listModuleKnowledge,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/modules/[slug]/knowledge/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/modules/reading/knowledge';
const DOC_ID = 'cjld2cjxh0000qzrmn831i7rn';
const TAG_ID = 'cjld2cyuq0000qzrmabcdef12';

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

beforeEach(() => vi.clearAllMocks());

describe('admin guard', () => {
  it('GET returns 401 unauthenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.GET(req('GET'), ctx('reading'))).status).toBe(401);
  });
  it('POST returns 403 for a non-admin and does not touch the service', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser('USER'));
    const res = await route.POST(req('POST', { documentId: DOC_ID }), ctx('reading'));
    expect(res.status).toBe(403);
    expect(svc.grantModuleDocument).not.toHaveBeenCalled();
  });
});

describe('GET /knowledge', () => {
  it('returns the scope in the envelope', async () => {
    asAdmin();
    svc.listModuleKnowledge.mockResolvedValue({ documents: [{ documentId: DOC_ID }], tags: [] });
    const res = await route.GET(req('GET'), ctx('reading'));
    expect(res.status).toBe(200);
    expect(svc.listModuleKnowledge).toHaveBeenCalledWith('reading');
    const body = await parse<{ data: { documents: unknown[] } }>(res);
    expect(body.data.documents).toHaveLength(1);
  });

  it('rejects a malformed slug (400), service untouched', async () => {
    asAdmin();
    expect((await route.GET(req('GET'), ctx('BAD SLUG'))).status).toBe(400);
    expect(svc.listModuleKnowledge).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError as 404', async () => {
    asAdmin();
    svc.listModuleKnowledge.mockRejectedValue(new NotFoundError('nope'));
    expect((await route.GET(req('GET'), ctx('ghost'))).status).toBe(404);
  });
});

describe('POST /knowledge (grant)', () => {
  it('grants a document (201) and forwards mapped args', async () => {
    asAdmin();
    svc.grantModuleDocument.mockResolvedValue(undefined);
    const res = await route.POST(req('POST', { documentId: DOC_ID }), ctx('reading'));
    expect(res.status).toBe(201);
    expect(svc.grantModuleDocument).toHaveBeenCalledWith(
      expect.objectContaining({ moduleSlug: 'reading', documentId: DOC_ID })
    );
    expect(svc.grantModuleTag).not.toHaveBeenCalled();
  });

  it('grants a tag when tagId is provided', async () => {
    asAdmin();
    svc.grantModuleTag.mockResolvedValue(undefined);
    const res = await route.POST(req('POST', { tagId: TAG_ID }), ctx('reading'));
    expect(res.status).toBe(201);
    expect(svc.grantModuleTag).toHaveBeenCalledWith(
      expect.objectContaining({ moduleSlug: 'reading', tagId: TAG_ID })
    );
    expect(svc.grantModuleDocument).not.toHaveBeenCalled();
  });

  it('rejects a body with BOTH documentId and tagId (400)', async () => {
    asAdmin();
    const res = await route.POST(
      req('POST', { documentId: DOC_ID, tagId: TAG_ID }),
      ctx('reading')
    );
    expect(res.status).toBe(400);
    expect(svc.grantModuleDocument).not.toHaveBeenCalled();
  });

  it('rejects a body with NEITHER (400)', async () => {
    asAdmin();
    expect((await route.POST(req('POST', {}), ctx('reading'))).status).toBe(400);
  });

  it('rejects a non-cuid documentId (400)', async () => {
    asAdmin();
    expect(
      (await route.POST(req('POST', { documentId: 'not-a-cuid' }), ctx('reading'))).status
    ).toBe(400);
  });

  it('maps a duplicate/unknown-target ValidationError to 400', async () => {
    asAdmin();
    svc.grantModuleDocument.mockRejectedValue(new ValidationError('dup'));
    expect((await route.POST(req('POST', { documentId: DOC_ID }), ctx('reading'))).status).toBe(
      400
    );
  });
});

describe('DELETE /knowledge (revoke)', () => {
  it('revokes a document by query param', async () => {
    asAdmin();
    svc.revokeModuleDocument.mockResolvedValue(undefined);
    const res = await route.DELETE(
      req('DELETE', undefined, `${BASE}?documentId=${DOC_ID}`),
      ctx('reading')
    );
    expect(res.status).toBe(200);
    expect(svc.revokeModuleDocument).toHaveBeenCalledWith(
      expect.objectContaining({ moduleSlug: 'reading', documentId: DOC_ID })
    );
    const body = await parse<{ data: { revoked: boolean } }>(res);
    expect(body.data.revoked).toBe(true);
  });

  it('revokes a tag by query param', async () => {
    asAdmin();
    svc.revokeModuleTag.mockResolvedValue(undefined);
    const res = await route.DELETE(
      req('DELETE', undefined, `${BASE}?tagId=${TAG_ID}`),
      ctx('reading')
    );
    expect(res.status).toBe(200);
    expect(svc.revokeModuleTag).toHaveBeenCalledWith(
      expect.objectContaining({ moduleSlug: 'reading', tagId: TAG_ID })
    );
  });

  it('rejects both targets in the query (400)', async () => {
    asAdmin();
    const res = await route.DELETE(
      req('DELETE', undefined, `${BASE}?documentId=${DOC_ID}&tagId=${TAG_ID}`),
      ctx('reading')
    );
    expect(res.status).toBe(400);
    expect(svc.revokeModuleDocument).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError (not in scope) as 404', async () => {
    asAdmin();
    svc.revokeModuleDocument.mockRejectedValue(new NotFoundError('not granted'));
    const res = await route.DELETE(
      req('DELETE', undefined, `${BASE}?documentId=${DOC_ID}`),
      ctx('reading')
    );
    expect(res.status).toBe(404);
  });
});

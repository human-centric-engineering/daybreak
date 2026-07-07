/**
 * Integration tests — framework conversation supervisor trigger (f-eval t-2). Admin-guarded; the
 * service called with mapped args; the standard envelope/status. The service is mocked via
 * `vi.hoisted`, so this `api/`-path test never imports `@/lib/framework` (X6 boundary).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({ supervise: vi.fn() }));

vi.mock('@/lib/framework/facilitation/evaluation/supervise', () => ({
  superviseConversation: svc.supervise,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/facilitation/evaluations/supervise/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/evaluations/supervise';
const CID = 'cjld2cyuq0000qzrmabcdef12';

function req(body?: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
  svc.supervise.mockResolvedValue({
    conversationId: CID,
    messageId: 'a2',
    verdict: 'pass',
    score: 0.9,
    summary: 'looks good',
    report: { verdict: 'pass' },
    tokensUsed: 42,
    costUsd: 0.03,
  });
});

describe('POST /evaluations/supervise', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.POST(req({ conversationId: CID }))).status).toBe(401);
    expect(svc.supervise).not.toHaveBeenCalled();
  });

  it('supervises a conversation and returns 201 with the verdict', async () => {
    const res = await route.POST(req({ conversationId: CID }));
    expect(res.status).toBe(201);
    expect(svc.supervise).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CID, actorUserId: expect.any(String) })
    );
    expect((await parse<{ data: { verdict: string } }>(res)).data.verdict).toBe('pass');
  });

  it('passes an optional modelOverride through', async () => {
    await route.POST(req({ conversationId: CID, modelOverride: 'model-z' }));
    expect(svc.supervise).toHaveBeenCalledWith(
      expect.objectContaining({ modelOverride: 'model-z' })
    );
  });

  it('400s a missing conversationId (body validation)', async () => {
    const res = await route.POST(req({}));
    expect(res.status).toBe(400);
    expect(svc.supervise).not.toHaveBeenCalled();
  });

  it('surfaces a non-framework-conversation ValidationError as 400', async () => {
    svc.supervise.mockRejectedValue(new ValidationError('not a framework surface'));
    expect((await route.POST(req({ conversationId: CID }))).status).toBe(400);
  });

  it('surfaces an unknown-conversation NotFoundError as 404', async () => {
    svc.supervise.mockRejectedValue(new NotFoundError('nope'));
    expect((await route.POST(req({ conversationId: CID }))).status).toBe(404);
  });
});

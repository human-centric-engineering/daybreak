/**
 * Integration tests — framework conversation-eval admin API (f-eval t-1). Admin-guarded; the right
 * service called with mapped args; the standard envelope/status. Services mocked via `vi.hoisted`, so
 * this `api/`-path test never imports `@/lib/framework` (X6 boundary).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/lib/api/errors';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({ score: vi.fn(), list: vi.fn() }));

vi.mock('@/lib/framework/facilitation/evaluation/score-conversation', () => ({
  scoreConversation: svc.score,
}));
vi.mock('@/lib/framework/facilitation/evaluation/queries', () => ({
  listConversationEvals: svc.list,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/facilitation/evaluations/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/evaluations';
const CID = 'cjld2cyuq0000qzrmabcdef12';

function req(method: string, body?: unknown, url = BASE): NextRequest {
  return new NextRequest(url, {
    method,
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
  svc.list.mockResolvedValue([{ id: 'e1' }]);
  svc.score.mockResolvedValue({
    conversationId: CID,
    scoredTurns: 2,
    skippedTurns: 0,
    totalCostUsd: 0.02,
    results: [],
  });
});

describe('GET /evaluations', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.GET(req('GET', undefined, `${BASE}?conversationId=${CID}`))).status).toBe(
      401
    );
  });

  it('lists a conversation eval rows', async () => {
    const res = await route.GET(req('GET', undefined, `${BASE}?conversationId=${CID}`));
    expect(res.status).toBe(200);
    expect(svc.list).toHaveBeenCalledWith(CID);
    expect((await parse<{ data: unknown[] }>(res)).data).toEqual([{ id: 'e1' }]);
  });

  it('400s when conversationId is missing or malformed', async () => {
    expect((await route.GET(req('GET'))).status).toBe(400);
    expect((await route.GET(req('GET', undefined, `${BASE}?conversationId=nope`))).status).toBe(
      400
    );
    expect(svc.list).not.toHaveBeenCalled();
  });
});

describe('POST /evaluations', () => {
  it('scores a conversation and returns 201 with the summary', async () => {
    const res = await route.POST(req('POST', { conversationId: CID }));
    expect(res.status).toBe(201);
    expect(svc.score).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CID, actorUserId: expect.any(String) })
    );
    expect((await parse<{ data: { scoredTurns: number } }>(res)).data.scoredTurns).toBe(2);
  });

  it('400s a missing conversationId (body validation)', async () => {
    const res = await route.POST(req('POST', {}));
    expect(res.status).toBe(400);
    expect(svc.score).not.toHaveBeenCalled();
  });

  it('surfaces a non-framework-conversation ValidationError as 400', async () => {
    svc.score.mockRejectedValue(new ValidationError('not a framework surface'));
    expect((await route.POST(req('POST', { conversationId: CID }))).status).toBe(400);
  });
});

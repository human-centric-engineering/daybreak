/**
 * Integration tests — framework proactive-guidance DELIVER API (f-overlays t-3b). Admin-guarded; the
 * delivery called with the parsed body; empty-body tolerance; invalid body → 400; standard envelope.
 * The framework service is fully mocked via `vi.hoisted`, so this `api/`-path test never imports
 * `@/lib/framework` (X6 boundary — enforced by ESLint).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({ deliver: vi.fn() }));

vi.mock('@/lib/framework/facilitation/overlays/nudge', () => ({
  deliverProactiveNudges: svc.deliver,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/facilitation/proactive-guidance/deliver/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/proactive-guidance/deliver';

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
  svc.deliver.mockResolvedValue({
    scanned: 3,
    candidates: 2,
    throttled: 1,
    sent: 1,
    noEmail: 0,
    failed: 0,
  });
});

describe('POST /proactive-guidance/deliver', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.POST(req({}))).status).toBe(401);
    expect(svc.deliver).not.toHaveBeenCalled();
  });

  it('delivers with defaults on an empty body and returns the summary', async () => {
    const res = await route.POST(req());
    expect(res.status).toBe(200);
    expect(svc.deliver).toHaveBeenCalledWith({});
    const data = (await parse<{ data: { sent: number } }>(res)).data;
    expect(data.sent).toBe(1);
  });

  it('passes body overrides through', async () => {
    await route.POST(req({ stalledDays: 14, maxJourneys: 50, throttleDays: 3 }));
    expect(svc.deliver).toHaveBeenCalledWith({ stalledDays: 14, maxJourneys: 50, throttleDays: 3 });
  });

  it('400s an invalid override', async () => {
    const res = await route.POST(req({ throttleDays: 0 }));
    expect(res.status).toBe(400);
    expect(svc.deliver).not.toHaveBeenCalled();
  });
});

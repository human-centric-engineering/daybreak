/**
 * Integration tests — framework proactive-guidance sweep preview API (f-overlays t-3a). Admin-guarded;
 * the sweep called with resolved defaults/overrides; empty-body tolerance; the standard envelope. The
 * framework module is fully mocked via `vi.hoisted`, so this `api/`-path test never imports
 * `@/lib/framework` (X6 boundary — enforced by ESLint).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  sweep: vi.fn(),
  stalledBeforeFromDays: vi.fn(),
}));

vi.mock('@/lib/framework/facilitation/overlays/proactive-sweep', () => ({
  runProactiveGuidanceSweep: svc.sweep,
  stalledBeforeFromDays: svc.stalledBeforeFromDays,
  DEFAULT_STALLED_DAYS: 7,
  DEFAULT_MAX_JOURNEYS: 100,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/facilitation/proactive-guidance/route';
import { auth } from '@/lib/auth/config';

const BASE = 'http://localhost/api/v1/admin/framework/facilitation/proactive-guidance';
const STALLED = new Date('2026-07-01T00:00:00Z');

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
  svc.stalledBeforeFromDays.mockReturnValue(STALLED);
  svc.sweep.mockResolvedValue({
    scanned: 3,
    candidates: [
      {
        userId: 'u1',
        journeyId: 'j1',
        graphSlug: 'g',
        contextKey: '',
        nodeKey: 'n',
        score: 5,
        reason: 'r',
      },
    ],
  });
});

describe('POST /proactive-guidance', () => {
  it('requires admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await route.POST(req({}))).status).toBe(401);
    expect(svc.sweep).not.toHaveBeenCalled();
  });

  it('runs the sweep with defaults on an empty body and returns candidates', async () => {
    const res = await route.POST(req()); // no body at all
    expect(res.status).toBe(200);
    expect(svc.stalledBeforeFromDays).toHaveBeenCalledWith(7, expect.any(Date)); // default days
    expect(svc.sweep).toHaveBeenCalledWith({ stalledBefore: STALLED, maxJourneys: 100 });
    const data = (await parse<{ data: { scanned: number; candidates: unknown[] } }>(res)).data;
    expect(data.scanned).toBe(3);
    expect(data.candidates).toHaveLength(1);
  });

  it('honours stalledDays / maxJourneys overrides', async () => {
    await route.POST(req({ stalledDays: 30, maxJourneys: 10 }));
    expect(svc.stalledBeforeFromDays).toHaveBeenCalledWith(30, expect.any(Date));
    expect(svc.sweep).toHaveBeenCalledWith({ stalledBefore: STALLED, maxJourneys: 10 });
  });

  it('400s an invalid override (non-positive maxJourneys)', async () => {
    const res = await route.POST(req({ maxJourneys: 0 }));
    expect(res.status).toBe(400);
    expect(svc.sweep).not.toHaveBeenCalled();
  });
});

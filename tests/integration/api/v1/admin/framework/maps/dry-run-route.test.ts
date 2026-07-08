/**
 * Integration test — framework map dry-run route (f-map-editor t-5, F18).
 *
 * POST /maps/[slug]/dry-run runs the PURE engine over the body definition + synthetic
 * inputs. Unlike the other map routes, the service here (`runDryRun`) is NOT mocked —
 * it is pure and DB-free, so the test exercises the real end-to-end contract. The
 * `@/lib/db/client` mock throws on ANY access, hard-proving the route touches no DB
 * (the "zero writes" F18 guarantee): if it ever did, these tests would throw.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAdminUser, mockUnauthenticatedUser } from '@/tests/helpers/auth';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
// Any DB access during a dry run is a contract violation — make it explode.
vi.mock('@/lib/db/client', () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error('dry-run must not touch the database');
      },
    }
  ),
}));

import * as dryRunRoute from '@/app/api/v1/admin/framework/maps/[slug]/dry-run/route';
import { auth } from '@/lib/auth/config';

const URL = 'http://localhost/api/v1/admin/framework/maps/demo/dry-run';
function req(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
const ctx = { params: Promise.resolve({ slug: 'demo' }) };
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

// a → b (prerequisite): with `a` completed, `b` is the only available move.
const MAP = {
  nodes: [
    { key: 'a', type: 'milestone' },
    { key: 'b', type: 'milestone' },
  ],
  edges: [{ from: 'a', to: 'b', type: 'prerequisite' }],
};

interface DryRunBody {
  success: boolean;
  data: {
    nodes: { nodeKey: string; available: boolean }[];
    validMoves: string[];
    ranked: { nodeKey: string }[];
  };
}

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
});

describe('POST /maps/[slug]/dry-run', () => {
  it('runs the pure engine over the body definition + synthetic completions', async () => {
    const res = await dryRunRoute.POST(req({ definition: MAP, completions: ['a'] }), ctx);
    expect(res.status).toBe(200);
    const body = await parse<DryRunBody>(res);
    expect(body.success).toBe(true);
    // `a` completed → locked; `b` unlocked and the single valid move.
    expect(body.data.validMoves).toEqual(['b']);
    expect(body.data.nodes.find((n) => n.nodeKey === 'a')?.available).toBe(false);
    expect(body.data.ranked.map((m) => m.nodeKey)).toEqual(['b']);
  });

  it('flows a synthetic clock through a temporal gate', async () => {
    const timed = {
      nodes: MAP.nodes,
      edges: [
        {
          from: 'a',
          to: 'b',
          type: 'prerequisite',
          condition: { family: 'temporal', kind: 'available_after', at: '2026-07-10T00:00:00Z' },
        },
      ],
    };
    const early = await parse<DryRunBody>(
      await dryRunRoute.POST(
        req({ definition: timed, completions: ['a'], now: '2026-07-05T00:00:00Z' }),
        ctx
      )
    );
    expect(early.data.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(false);

    const late = await parse<DryRunBody>(
      await dryRunRoute.POST(
        req({ definition: timed, completions: ['a'], now: '2026-07-11T00:00:00Z' }),
        ctx
      )
    );
    expect(late.data.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(true);
  });

  it('400s a malformed definition instead of crashing', async () => {
    const res = await dryRunRoute.POST(req({ definition: { nodes: 'nope' } }), ctx);
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated caller', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await dryRunRoute.POST(req({ definition: MAP }), ctx);
    expect(res.status).toBe(401);
  });
});

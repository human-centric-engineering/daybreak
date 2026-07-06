/**
 * Unit tests: POST /api/v1/framework/facilitation/:role/chat/stream (f-facilitation-agents t-2).
 *
 * The facilitation-surface chat route. Mocks the surface resolver, streamChat, and sseResponse;
 * asserts the happy path threads contextType/contextId (and NO scope) into streamChat, an unknown/
 * unbound role → 404, an invalid body → 400, and the rate limits → 429.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/framework/facilitation/[role]/chat/stream/route';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/security/rate-limit', () => ({
  consumerChatLimiter: { check: vi.fn(() => ({ success: true })) },
  agentChatLimiter: { check: vi.fn(() => ({ success: true })) },
  createRateLimitResponse: vi.fn(
    () =>
      new Response(JSON.stringify({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } }), {
        status: 429,
      })
  ),
}));
vi.mock('@/lib/orchestration/chat', () => ({ streamChat: vi.fn(() => ({})) }));
vi.mock('@/lib/api/sse', () => ({
  sseResponse: vi.fn(() => new Response('data: ok\n\n', { status: 200 })),
}));
vi.mock('@/lib/logging/context', () => ({
  getRequestId: vi.fn(() => Promise.resolve('req-1')),
  getVisitorId: vi.fn(() => Promise.resolve('vid-1')),
}));
vi.mock('@/lib/framework/facilitation/agents/surface', () => ({
  resolveFacilitationSurface: vi.fn(),
  FACILITATION_SURFACE_CONTEXT_TYPE: 'facilitation',
}));

import { auth } from '@/lib/auth/config';
import { consumerChatLimiter, agentChatLimiter } from '@/lib/security/rate-limit';
import { streamChat } from '@/lib/orchestration/chat';
import { resolveFacilitationSurface } from '@/lib/framework/facilitation/agents/surface';
import type { FacilitationSurface } from '@/lib/framework/facilitation/agents/surface';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: 'http://localhost/api/v1/framework/facilitation/onboarding/chat/stream',
    signal: new AbortController().signal,
  }) as unknown as NextRequest;

const ctx = (role = 'onboarding') => ({ params: Promise.resolve({ role }) });

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks resets call history but NOT return values — re-arm the limiters to success so a
  // per-test override (429 cases) doesn't leak into the next test.
  vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: true } as never);
  vi.mocked(agentChatLimiter.check).mockReturnValue({ success: true } as never);
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1' },
    session: { id: 's1' },
  } as never);
  vi.mocked(resolveFacilitationSurface).mockResolvedValue({
    agentSlug: 'welcomer',
    agentId: 'agent-1',
    conversationId: 'conv-9',
    rateLimitRpm: 5,
  });
});

describe('POST facilitation surface chat', () => {
  it('threads contextType/contextId (and NO scope) into streamChat and returns the SSE stream', async () => {
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(200);
    expect(resolveFacilitationSurface).toHaveBeenCalledWith('user-1', 'onboarding');
    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'hi',
        agentSlug: 'welcomer',
        userId: 'user-1',
        conversationId: 'conv-9',
        contextType: 'facilitation',
        contextId: 'onboarding',
      })
    );
    // Decision 4: facilitation threads no scope — the guidance caps are scope-agnostic.
    expect(vi.mocked(streamChat).mock.calls[0][0]).not.toHaveProperty('scope');
    // The agent's per-agent RPM override is honoured (parity with the direct consumer route).
    expect(agentChatLimiter.check).toHaveBeenCalledWith('agent-1:user-1', 5);
  });

  it('404s when the role has no usable agent surface', async () => {
    vi.mocked(resolveFacilitationSurface).mockResolvedValue(null);
    const res = await POST(req({ message: 'hi' }), ctx('made-up'));
    expect(res.status).toBe(404);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('400s on an invalid body (missing message)', async () => {
    const res = await POST(req({}), ctx());
    expect(res.status).toBe(400);
    expect(resolveFacilitationSurface).not.toHaveBeenCalled();
  });

  it('429s when the per-user rate limit is exceeded (no surface resolution)', async () => {
    vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: false } as never);
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(429);
    expect(resolveFacilitationSurface).not.toHaveBeenCalled();
  });

  it('429s when the per-agent rate limit is exceeded (default cap for a null override)', async () => {
    // rateLimitRpm null exercises the `?? undefined` fallback to the default cap.
    vi.mocked(resolveFacilitationSurface).mockResolvedValue({
      agentSlug: 'welcomer',
      agentId: 'agent-1',
      conversationId: undefined,
      rateLimitRpm: null,
    } satisfies FacilitationSurface);
    vi.mocked(agentChatLimiter.check).mockReturnValue({ success: false } as never);
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(429);
    expect(vi.mocked(agentChatLimiter.check).mock.calls[0]).toEqual(['agent-1:user-1', undefined]);
    expect(streamChat).not.toHaveBeenCalled();
  });
});

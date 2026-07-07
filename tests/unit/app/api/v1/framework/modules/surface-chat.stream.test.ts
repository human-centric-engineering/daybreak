/**
 * Unit tests: POST /api/v1/framework/modules/:slug/chat/stream (f-guidance t-5, X5).
 *
 * The module-surface chat route. Mocks the surface resolver, streamChat, and sseResponse;
 * asserts the happy path threads `scope.moduleSlug` + contextType/contextId into streamChat,
 * a module with no usable agent → 404, an invalid body → 400, and the user rate-limit → 429.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/framework/modules/[slug]/chat/stream/route';
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
vi.mock('@/lib/framework/guidance/surface', () => ({
  resolveModuleSurface: vi.fn(),
  MODULE_SURFACE_CONTEXT_TYPE: 'module',
}));
vi.mock('@/lib/framework/engagement', () => ({
  recordModuleEngagement: vi.fn(),
  ENGAGEMENT_EVENT_TYPE: { moduleEntered: 'module.entered' },
}));

import { auth } from '@/lib/auth/config';
import { consumerChatLimiter, agentChatLimiter } from '@/lib/security/rate-limit';
import { streamChat } from '@/lib/orchestration/chat';
import { resolveModuleSurface } from '@/lib/framework/guidance/surface';
import type { ModuleSurface } from '@/lib/framework/guidance/surface';
import { recordModuleEngagement } from '@/lib/framework/engagement';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: 'http://localhost/api/v1/framework/modules/onboarding/chat/stream',
    signal: new AbortController().signal,
  }) as unknown as NextRequest;

const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks resets call history but NOT return values — re-arm the limiters to success
  // so a per-test override (429 cases) doesn't leak into the next test.
  vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: true } as never);
  vi.mocked(agentChatLimiter.check).mockReturnValue({ success: true } as never);
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1' },
    session: { id: 's1' },
  } as never);
  vi.mocked(resolveModuleSurface).mockResolvedValue({
    agentSlug: 'coach',
    agentId: 'agent-1',
    conversationId: 'conv-9',
    scope: { moduleSlug: 'onboarding' },
    rateLimitRpm: 3,
  });
});

describe('POST module surface chat', () => {
  it('threads scope.moduleSlug + contextType/contextId into streamChat and returns the SSE stream', async () => {
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(200);
    expect(resolveModuleSurface).toHaveBeenCalledWith('user-1', 'onboarding');
    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'hi',
        agentSlug: 'coach',
        userId: 'user-1',
        conversationId: 'conv-9',
        contextType: 'module',
        contextId: 'onboarding',
        scope: { moduleSlug: 'onboarding' }, // the X5 write
      })
    );
    // The agent's per-agent RPM override is honoured (parity with the direct consumer route).
    expect(agentChatLimiter.check).toHaveBeenCalledWith('agent-1:user-1', 3);
  });

  it('does NOT record an entry when resuming an existing conversation', async () => {
    // The default surface resolves conversationId 'conv-9' — a resume, not a new entry.
    await POST(req({ message: 'hi' }), ctx());
    expect(recordModuleEngagement).not.toHaveBeenCalled();
  });

  it('records a module.entered engagement event on a fresh conversation only', async () => {
    vi.mocked(resolveModuleSurface).mockResolvedValue({
      agentSlug: 'coach',
      agentId: 'agent-1',
      conversationId: undefined, // nothing to resume → a fresh entry
      scope: { moduleSlug: 'onboarding' },
      rateLimitRpm: 3,
    } satisfies ModuleSurface);
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(200);
    expect(recordModuleEngagement).toHaveBeenCalledWith({
      userId: 'user-1',
      moduleSlug: 'onboarding',
      type: 'module.entered',
    });
    // Fire-and-forget: the stream is returned regardless of the emit.
    expect(streamChat).toHaveBeenCalled();
  });

  it('404s when the module has no usable agent surface', async () => {
    vi.mocked(resolveModuleSurface).mockResolvedValue(null);
    const res = await POST(req({ message: 'hi' }), ctx('empty-module'));
    expect(res.status).toBe(404);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('400s on an invalid body (missing message)', async () => {
    const res = await POST(req({}), ctx());
    expect(res.status).toBe(400);
    expect(resolveModuleSurface).not.toHaveBeenCalled();
  });

  it('429s when the per-user rate limit is exceeded (no surface resolution)', async () => {
    vi.mocked(consumerChatLimiter.check).mockReturnValue({ success: false } as never);
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(429);
    expect(resolveModuleSurface).not.toHaveBeenCalled();
  });

  it('429s when the per-agent rate limit is exceeded (default cap for a null override)', async () => {
    // rateLimitRpm null exercises the `?? undefined` fallback to the default cap.
    vi.mocked(resolveModuleSurface).mockResolvedValue({
      agentSlug: 'coach',
      agentId: 'agent-1',
      conversationId: undefined,
      scope: { moduleSlug: 'onboarding' },
      rateLimitRpm: null,
    } satisfies ModuleSurface);
    vi.mocked(agentChatLimiter.check).mockReturnValue({ success: false } as never);
    const res = await POST(req({ message: 'hi' }), ctx());
    expect(res.status).toBe(429);
    expect(vi.mocked(agentChatLimiter.check).mock.calls[0]).toEqual(['agent-1:user-1', undefined]);
    expect(streamChat).not.toHaveBeenCalled();
  });
});

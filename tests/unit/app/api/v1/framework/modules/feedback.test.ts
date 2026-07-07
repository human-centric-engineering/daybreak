/**
 * Unit tests: POST /api/v1/framework/modules/:slug/feedback (f-engagement t-2).
 *
 * The plain user-facing feedback endpoint. Mocks auth, the module-exists guard, and the
 * emit seam; asserts the happy path records a `module.feedback` event for the authed user,
 * an unknown module 404s before writing, and an invalid/missing rating 400s.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/framework/modules/[slug]/feedback/route';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/framework/modules/queries', () => ({ moduleExists: vi.fn() }));
vi.mock('@/lib/framework/engagement', () => ({
  recordModuleEngagement: vi.fn(),
  ENGAGEMENT_EVENT_TYPE: { moduleEntered: 'module.entered', moduleFeedback: 'module.feedback' },
}));

import { auth } from '@/lib/auth/config';
import { moduleExists } from '@/lib/framework/modules/queries';
import { recordModuleEngagement } from '@/lib/framework/engagement';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: 'http://localhost/api/v1/framework/modules/onboarding/feedback',
    signal: new AbortController().signal,
  }) as unknown as NextRequest;

const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1' },
    session: { id: 's1' },
  } as never);
  vi.mocked(moduleExists).mockResolvedValue(true);
});

describe('POST module feedback', () => {
  it('records a module.feedback event for the authed user', async () => {
    const res = await POST(req({ rating: 5, comment: 'great' }), ctx());
    expect(res.status).toBe(200);
    expect(recordModuleEngagement).toHaveBeenCalledWith({
      userId: 'user-1',
      moduleSlug: 'onboarding',
      type: 'module.feedback',
      payload: { rating: 5, comment: 'great' },
    });
  });

  it('omits the comment when not supplied', async () => {
    await POST(req({ rating: 4 }), ctx());
    expect(recordModuleEngagement).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { rating: 4 } })
    );
  });

  it('404s an unknown module before writing', async () => {
    vi.mocked(moduleExists).mockResolvedValue(false);
    const res = await POST(req({ rating: 5 }), ctx('ghost'));
    expect(res.status).toBe(404);
    expect(recordModuleEngagement).not.toHaveBeenCalled();
  });

  it('400s an out-of-range rating (validation runs before the module lookup)', async () => {
    const res = await POST(req({ rating: 9 }), ctx());
    expect(res.status).toBe(400);
    expect(moduleExists).not.toHaveBeenCalled();
    expect(recordModuleEngagement).not.toHaveBeenCalled();
  });

  it('400s a missing rating', async () => {
    const res = await POST(req({ comment: 'no rating' }), ctx());
    expect(res.status).toBe(400);
    expect(recordModuleEngagement).not.toHaveBeenCalled();
  });
});

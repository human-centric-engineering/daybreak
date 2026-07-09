/**
 * Proactive-guidance nudge delivery (f-overlays t-3b). Mocks the sweep, the throttle read, the DB
 * client (user lookup + throttle upsert), and `sendEmail`. Proves: the no-candidates early return, the
 * throttle filter, per-owner email + throttle-record on success, the no-email skip, and the
 * non-sent / thrown-error failure paths (counted, not fatal; not throttled).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/overlays/proactive-sweep', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/framework/facilitation/overlays/proactive-sweep')>();
  return { ...actual, runProactiveGuidanceSweep: vi.fn() }; // keep real stalledBeforeFromDays + defaults
});
vi.mock('@/lib/framework/facilitation/overlays/queries', () => ({
  listRecentlyNudgedJourneyIds: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: { user: { findMany: vi.fn() }, frameworkJourneyNudge: { upsert: vi.fn() } },
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/api/server-fetch', () => ({ getBaseUrl: () => 'https://app.test' }));
vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/framework/facilitation/overlays/nudge-channel', () => ({
  resolveNudgeChannelConfig: vi.fn(),
}));

import { deliverProactiveNudges } from '@/lib/framework/facilitation/overlays/nudge';
import { runProactiveGuidanceSweep } from '@/lib/framework/facilitation/overlays/proactive-sweep';
import { listRecentlyNudgedJourneyIds } from '@/lib/framework/facilitation/overlays/queries';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/send';
import { resolveNudgeChannelConfig } from '@/lib/framework/facilitation/overlays/nudge-channel';

const candidate = (userId: string, journeyId: string) => ({
  userId,
  journeyId,
  graphSlug: 'onboarding',
  contextKey: '',
  nodeKey: 'next',
  score: 5,
  reason: 'A next step is worth surfacing now.',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listRecentlyNudgedJourneyIds).mockResolvedValue(new Set());
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.frameworkJourneyNudge.upsert).mockResolvedValue({} as never);
  vi.mocked(sendEmail).mockResolvedValue({ status: 'sent' } as never);
  // Default channel: email only (f-overlays behaviour). Webhook tests override this.
  vi.mocked(resolveNudgeChannelConfig).mockReturnValue({ emailEnabled: true, webhookUrl: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

describe('deliverProactiveNudges', () => {
  it('returns early with no work when the sweep finds no candidates', async () => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({ scanned: 4, candidates: [] });
    const result = await deliverProactiveNudges({ now: new Date('2026-07-08T00:00:00Z') });
    expect(result).toEqual({
      scanned: 4,
      candidates: 0,
      throttled: 0,
      emailsSent: 0,
      webhooksSent: 0,
      journeysNudged: 0,
      noEmail: 0,
      failed: 0,
      webhookFailed: 0,
    });
    expect(listRecentlyNudgedJourneyIds).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('throttles recently-nudged journeys, emails the rest (custom windows), and records each send', async () => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 2,
      candidates: [candidate('u1', 'j1'), candidate('u2', 'j2')],
    });
    vi.mocked(listRecentlyNudgedJourneyIds).mockResolvedValue(new Set(['j2'])); // j2 throttled
    // Null name exercises the "there" fallback; owner still has an email so the send proceeds.
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'u1@test.dev', name: null },
    ] as never);

    const now = new Date('2026-07-08T00:00:00Z');
    // Explicit overrides exercise the provided-side of the `?? DEFAULT` resolution.
    const result = await deliverProactiveNudges({
      stalledDays: 10,
      maxJourneys: 20,
      throttleDays: 5,
      now,
    });

    expect(result).toMatchObject({
      candidates: 2,
      throttled: 1,
      emailsSent: 1,
      journeysNudged: 1,
      noEmail: 0,
      failed: 0,
    });
    // Custom maxJourneys + a stalledBefore 10 days back reach the sweep.
    expect(runProactiveGuidanceSweep).toHaveBeenCalledWith({
      stalledBefore: new Date('2026-06-28T00:00:00Z'),
      maxJourneys: 20,
    });
    // Throttle window is 5 days back.
    expect(listRecentlyNudgedJourneyIds).toHaveBeenCalledWith(
      ['j1', 'j2'],
      new Date('2026-07-03T00:00:00Z')
    );
    // Only the fresh (non-throttled) owner is looked up + emailed.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['u1'] } } })
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: 'u1@test.dev' });
    // Send recorded on the throttle row (keyed by journey).
    expect(vi.mocked(prisma.frameworkJourneyNudge.upsert).mock.calls[0][0]).toMatchObject({
      where: { journeyId: 'j1' },
      create: { userId: 'u1', journeyId: 'j1', nodeKey: 'next' },
    });
  });

  it('skips a candidate whose owner has no email (no send, no throttle row)', async () => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 1,
      candidates: [candidate('u1', 'j1')],
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: null, name: null },
    ] as never);

    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({ emailsSent: 0, noEmail: 1, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.frameworkJourneyNudge.upsert).not.toHaveBeenCalled();
  });

  it('sends ONE email per user for a multi-journey user, throttling all their journeys', async () => {
    // Same owner, two stalled journeys — the generic nudge must not duplicate.
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 2,
      candidates: [candidate('u1', 'j1'), candidate('u1', 'j2')],
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'u1@test.dev', name: 'Ana' },
    ] as never);

    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({
      candidates: 2,
      throttled: 0,
      emailsSent: 1, // one email, not two
      journeysNudged: 2, // both journeys throttled
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(prisma.frameworkJourneyNudge.upsert).toHaveBeenCalledTimes(2);
    const throttledJourneyIds = vi
      .mocked(prisma.frameworkJourneyNudge.upsert)
      .mock.calls.map((c) => (c[0] as { where: { journeyId: string } }).where.journeyId);
    expect(new Set(throttledJourneyIds)).toEqual(new Set(['j1', 'j2']));
  });

  it('counts a non-sent result as failed and does NOT throttle it (retried next sweep)', async () => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 1,
      candidates: [candidate('u1', 'j1')],
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'u1@test.dev', name: 'Ana' },
    ] as never);
    vi.mocked(sendEmail).mockResolvedValue({ status: 'disabled' } as never);

    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({ emailsSent: 0, failed: 1 });
    expect(prisma.frameworkJourneyNudge.upsert).not.toHaveBeenCalled();
  });

  it('isolates a thrown send error as a failure (batch continues)', async () => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 2,
      candidates: [candidate('u1', 'j1'), candidate('u2', 'j2')],
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'u1@test.dev', name: 'A' },
      { id: 'u2', email: 'u2@test.dev', name: 'B' },
    ] as never);
    vi.mocked(sendEmail)
      .mockRejectedValueOnce(new Error('smtp down')) // Error branch of the catch
      .mockRejectedValueOnce('string failure'); // non-Error branch (String(err))

    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({ candidates: 2, emailsSent: 0, failed: 2 });
  });

  it('counts the email as sent even if the throttle-record upsert fails (best-effort)', async () => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 1,
      candidates: [candidate('u1', 'j1')],
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'u1@test.dev', name: 'Ana' },
    ] as never);
    vi.mocked(prisma.frameworkJourneyNudge.upsert).mockRejectedValue(new Error('write conflict'));

    const result = await deliverProactiveNudges();
    // Email went out (counted), but the throttle row wasn't recorded (send not marked failed).
    expect(result).toMatchObject({ emailsSent: 1, journeysNudged: 0, failed: 0 });
  });
});

describe('deliverProactiveNudges — webhook channel (f-governance-plus t-4)', () => {
  const HOOK = 'https://hooks.test/nudge';

  beforeEach(() => {
    vi.mocked(runProactiveGuidanceSweep).mockResolvedValue({
      scanned: 1,
      candidates: [candidate('u1', 'j1')],
    });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'u1@test.dev', name: 'U1' },
    ] as never);
  });

  it('webhook-only: POSTs the grouped per-owner payload, sends no email, throttles', async () => {
    vi.mocked(resolveNudgeChannelConfig).mockReturnValue({ emailEnabled: false, webhookUrl: HOOK });
    const result = await deliverProactiveNudges({ now: new Date('2026-07-08T00:00:00Z') });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      event: 'proactive_nudge',
      userId: 'u1',
      email: 'u1@test.dev',
      journeys: [
        {
          journeyId: 'j1',
          graphSlug: 'onboarding',
          nodeKey: 'next',
          reason: candidate('u1', 'j1').reason,
        },
      ],
      timestamp: '2026-07-08T00:00:00.000Z',
    });
    expect(result).toMatchObject({ emailsSent: 0, webhooksSent: 1, journeysNudged: 1, failed: 0 });
  });

  it('both: sends email AND webhook, throttling once', async () => {
    vi.mocked(resolveNudgeChannelConfig).mockReturnValue({ emailEnabled: true, webhookUrl: HOOK });
    const result = await deliverProactiveNudges();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ emailsSent: 1, webhooksSent: 1, journeysNudged: 1 });
  });

  it('webhook non-OK is isolated; if email still delivered, the owner is throttled', async () => {
    vi.mocked(resolveNudgeChannelConfig).mockReturnValue({ emailEnabled: true, webhookUrl: HOOK });
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as never);
    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({
      emailsSent: 1,
      webhooksSent: 0,
      webhookFailed: 1,
      journeysNudged: 1,
    });
  });

  it('webhook-only with a failing POST: nothing delivered → NOT throttled (retried next sweep)', async () => {
    vi.mocked(resolveNudgeChannelConfig).mockReturnValue({ emailEnabled: false, webhookUrl: HOOK });
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({ webhooksSent: 0, webhookFailed: 1, journeysNudged: 0 });
    expect(prisma.frameworkJourneyNudge.upsert).not.toHaveBeenCalled();
  });

  it('webhook can deliver to an owner with no email address', async () => {
    vi.mocked(resolveNudgeChannelConfig).mockReturnValue({ emailEnabled: false, webhookUrl: HOOK });
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: null, name: null },
    ] as never);
    const result = await deliverProactiveNudges();
    expect(result).toMatchObject({ webhooksSent: 1, journeysNudged: 1, noEmail: 0 });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).email).toBeNull();
  });
});

/**
 * `resolveJourneyNow` (f-engine t-2) — the timezone-resolving seam. Mocks
 * `@/lib/db/client` so no live DB is loaded (house style). Proves it reads
 * `User.timezone`, falls back to UTC, and honours the `at` override.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { resolveJourneyNow } from '@/lib/framework/facilitation/engine/now';
import { prisma } from '@/lib/db/client';

beforeEach(() => vi.clearAllMocks());

describe('resolveJourneyNow', () => {
  it('reads the user’s IANA timezone and uses the supplied instant', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'America/New_York' } as never);
    const at = new Date('2026-07-05T12:00:00Z');

    const resolved = await resolveJourneyNow('user_1', at);

    expect(resolved).toEqual({ instant: at, timeZone: 'America/New_York' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { timezone: true },
    });
  });

  it('falls back to UTC when the user has no timezone or does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: null } as never);
    expect((await resolveJourneyNow('user_1', new Date(0))).timeZone).toBe('UTC');

    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect((await resolveJourneyNow('ghost', new Date(0))).timeZone).toBe('UTC');
  });

  it('defaults the instant to now when no override is given', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'UTC' } as never);
    const before = Date.now();
    const { instant } = await resolveJourneyNow('user_1');
    expect(instant.getTime()).toBeGreaterThanOrEqual(before);
  });
});

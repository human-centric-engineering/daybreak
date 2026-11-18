/**
 * Framework conversation turn reader (f-eval t-1). Mocks the DB client; proves the user→assistant
 * pairing, citation extraction from `provenance`, and the skip rules (assistant with no preceding
 * user; tool/system turns don't affect pairing; each user pairs at most one assistant; rows core
 * leaves out of history never reach a turn).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { aiMessage: { findMany: vi.fn() } } }));

import { listScorableTurns } from '@/lib/framework/facilitation/evaluation/turns';
import { prisma } from '@/lib/db/client';

const msg = (over: Record<string, unknown>) => ({
  id: 'm',
  role: 'user',
  content: '',
  provenance: null,
  metadata: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('listScorableTurns', () => {
  it('pairs each assistant with its preceding user and lifts citations from provenance', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      msg({ id: 'u1', role: 'user', content: 'Q1' }),
      msg({
        id: 'a1',
        role: 'assistant',
        content: 'A1',
        provenance: { citations: [{ marker: 1, excerpt: 'x' }] },
      }),
    ] as never);

    const turns = await listScorableTurns('c1');
    expect(turns).toEqual([
      {
        messageId: 'a1',
        userQuestion: 'Q1',
        aiResponse: 'A1',
        citations: [{ marker: 1, excerpt: 'x' }],
      },
    ]);
  });

  it('defaults citations to [] when provenance has none', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 'a1', role: 'assistant', content: 'A', provenance: {} }),
    ] as never);
    expect((await listScorableTurns('c1'))[0].citations).toEqual([]);
  });

  it('ignores tool/system turns between the user and assistant', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 't1', role: 'tool', content: 'tool output' }),
      msg({ id: 'a1', role: 'assistant', content: 'A' }),
    ] as never);
    const turns = await listScorableTurns('c1');
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ messageId: 'a1', userQuestion: 'Q' });
  });

  it('skips an assistant with no preceding user, and pairs each user only once', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      msg({ id: 'a0', role: 'assistant', content: 'orphan' }), // no preceding user → skipped
      msg({ id: 'u1', role: 'user', content: 'Q1' }),
      msg({ id: 'a1', role: 'assistant', content: 'A1' }),
      msg({ id: 'a2', role: 'assistant', content: 'A2' }), // no fresh user → skipped
      msg({ id: 'u2', role: 'user', content: 'Q2' }),
      msg({ id: 'a3', role: 'assistant', content: 'A3' }),
    ] as never);
    const turns = await listScorableTurns('c1');
    expect(turns.map((t) => t.messageId)).toEqual(['a1', 'a3']);
    expect(turns.map((t) => t.userQuestion)).toEqual(['Q1', 'Q2']);
  });

  it('reads metadata so it can tell which rows core leaves out of history', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([] as never);
    await listScorableTurns('c1');
    expect(vi.mocked(prisma.aiMessage.findMany).mock.calls[0][0]).toMatchObject({
      select: { metadata: true },
    });
  });

  it('skips the rows of a turn the privacy layer refused, so its details never reach the judge', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      msg({
        id: 'u1',
        role: 'user',
        content: 'My card is 4111 1111 1111 1111',
        metadata: { excludedFromHistory: 'privacy_blocked' },
      }),
      msg({
        id: 'a1',
        role: 'assistant',
        content: 'calling a tool',
        metadata: { excludedFromHistory: 'privacy_blocked' },
      }),
      msg({ id: 'u2', role: 'user', content: 'Q2' }),
      msg({ id: 'a2', role: 'assistant', content: 'A2' }),
    ] as never);
    const turns = await listScorableTurns('c1');
    expect(turns).toEqual([
      { messageId: 'a2', userQuestion: 'Q2', aiResponse: 'A2', citations: [] },
    ]);
  });

  it('skips an assistant error marker, so it is neither scored nor consumes the user turn', async () => {
    vi.mocked(prisma.aiMessage.findMany).mockResolvedValue([
      msg({ id: 'u1', role: 'user', content: 'Q1' }),
      msg({
        id: 'e1',
        role: 'assistant',
        content: 'Something went wrong',
        metadata: { error: true },
      }),
      msg({ id: 'a1', role: 'assistant', content: 'A1' }),
    ] as never);
    const turns = await listScorableTurns('c1');
    expect(turns.map((t) => [t.messageId, t.userQuestion])).toEqual([['a1', 'Q1']]);
  });
});

/**
 * Shared framework-conversation gate (f-eval). Proves the surface allow-list: facilitation/module
 * pass; unknown → NotFoundError; a non-framework surface (or null) → ValidationError.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { aiConversation: { findUnique: vi.fn() } } }));

import { loadFrameworkConversation } from '@/lib/framework/facilitation/evaluation/conversation';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

beforeEach(() => vi.clearAllMocks());

describe('loadFrameworkConversation', () => {
  it.each(['facilitation', 'module'])('accepts a %s conversation', async (contextType) => {
    vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue({
      id: 'c1',
      contextType,
      contextId: 'x',
    } as never);
    await expect(loadFrameworkConversation('c1')).resolves.toMatchObject({ id: 'c1', contextType });
  });

  it('404s an unknown conversation', async () => {
    vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue(null);
    await expect(loadFrameworkConversation('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([['evaluation'], [null]])(
    'rejects a non-framework surface (%s) with ValidationError',
    async (contextType) => {
      vi.mocked(prisma.aiConversation.findUnique).mockResolvedValue({
        id: 'c1',
        contextType,
        contextId: null,
      } as never);
      await expect(loadFrameworkConversation('c1')).rejects.toBeInstanceOf(ValidationError);
    }
  );
});

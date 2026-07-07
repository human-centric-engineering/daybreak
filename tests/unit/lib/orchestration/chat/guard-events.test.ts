/**
 * Guard-event contributor registry (core seam, added by Daybreak f-emergence t-1). Proves the seam
 * is inert when empty, notifies every contributor fire-and-forget, swallows a throwing contributor,
 * and is idempotent per key. `emitGuardEvent` is fire-and-forget, so tests flush the microtask queue
 * before asserting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerGuardEventContributor,
  __resetGuardEventContributorsForTests,
  emitGuardEvent,
  type GuardEventContext,
  type GuardEvent,
} from '@/lib/orchestration/chat/guard-events';

const ctx: GuardEventContext = {
  contextType: 'facilitation',
  contextId: 'onboarding',
  agentId: 'a1',
  userId: 'u1',
  conversationId: 'c1',
};
const event: GuardEvent = { guard: 'output', outcome: 'blocked' };

/** Let the detached fire-and-forget contributor microtasks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => __resetGuardEventContributorsForTests());

describe('emitGuardEvent', () => {
  it('is a no-op when the registry is empty (seam inert — vanilla behaviour)', async () => {
    expect(() => emitGuardEvent(ctx, event)).not.toThrow();
    await flush();
  });

  it('notifies every registered contributor with the ctx + event', async () => {
    const a = vi.fn();
    const b = vi.fn();
    registerGuardEventContributor('a', a);
    registerGuardEventContributor('b', b);
    emitGuardEvent(ctx, event);
    await flush();
    expect(a).toHaveBeenCalledWith(ctx, event);
    expect(b).toHaveBeenCalledWith(ctx, event);
  });

  it('returns synchronously without awaiting contributors (fire-and-forget)', () => {
    let ran = false;
    registerGuardEventContributor('slow', async () => {
      await Promise.resolve();
      ran = true;
    });
    emitGuardEvent(ctx, event); // returns before the async contributor resolves
    expect(ran).toBe(false);
  });

  it('swallows a throwing contributor and still runs the others', async () => {
    const ok = vi.fn();
    registerGuardEventContributor('throws', () => {
      throw new Error('boom');
    });
    registerGuardEventContributor('ok', ok);
    expect(() => emitGuardEvent(ctx, event)).not.toThrow();
    await flush();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('swallows a rejecting async contributor', async () => {
    registerGuardEventContributor('rejects', async () => {
      throw new Error('async boom');
    });
    emitGuardEvent(ctx, event);
    await flush(); // no unhandled rejection
  });

  it('replaces a contributor registered under the same key (idempotent)', async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerGuardEventContributor('k', first);
    registerGuardEventContributor('k', second);
    emitGuardEvent(ctx, event);
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

/**
 * Map post-publish hook seam (f-governance-plus t-4). Proves register + notify, dedup by function
 * ref, and that a throwing listener is isolated (logged, others still run, notify never throws).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import {
  registerMapPublishListener,
  notifyMapPublished,
  __resetMapPublishListenersForTests,
} from '@/lib/framework/facilitation/map/publish-hooks';
import { logger } from '@/lib/logging';

beforeEach(() => {
  __resetMapPublishListenersForTests();
  vi.clearAllMocks();
});

describe('map publish hooks', () => {
  it('notifies every registered listener with (slug, actorUserId)', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerMapPublishListener(a);
    registerMapPublishListener(b);
    notifyMapPublished('onboarding', 'admin-1');
    expect(a).toHaveBeenCalledWith('onboarding', 'admin-1');
    expect(b).toHaveBeenCalledWith('onboarding', 'admin-1');
  });

  it('threads a null actor through', () => {
    const a = vi.fn();
    registerMapPublishListener(a);
    notifyMapPublished('onboarding', null);
    expect(a).toHaveBeenCalledWith('onboarding', null);
  });

  it('dedups the same function reference', () => {
    const a = vi.fn();
    registerMapPublishListener(a);
    registerMapPublishListener(a);
    notifyMapPublished('g', 'u');
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener — logs it, still runs the others, never throws', () => {
    const bad = vi.fn(() => {
      throw new Error('listener boom');
    });
    const good = vi.fn();
    registerMapPublishListener(bad);
    registerMapPublishListener(good);
    expect(() => notifyMapPublished('g', 'u')).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      'Map publish listener threw (isolated)',
      expect.objectContaining({ slug: 'g' })
    );
  });

  it('isolates a listener that throws a non-Error value too', () => {
    registerMapPublishListener(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'a string, not an Error';
    });
    expect(() => notifyMapPublished('g', 'u')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Map publish listener threw (isolated)',
      expect.objectContaining({ error: 'a string, not an Error' })
    );
  });

  it('is a no-op with no listeners registered', () => {
    expect(() => notifyMapPublished('g', 'u')).not.toThrow();
  });
});

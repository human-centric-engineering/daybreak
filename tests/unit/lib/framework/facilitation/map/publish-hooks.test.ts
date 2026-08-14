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

/**
 * #160 — the realm split.
 *
 * This seam registers at boot (`initFramework()`) but fires from the request path
 * (`version-service.ts`, via the admin publish/rollback routes), so it sits across
 * the instrumentation/route module-graph boundary. `vi.resetModules()` + re-import
 * reproduces the second graph: it rebinds every module-scoped `const`, so only
 * state on `globalThis` survives.
 *
 * Fails against a module-scoped `const listeners = []`, where the request realm
 * sees an empty list and `autoEmbedAfterPublish` silently never runs.
 */
describe('cross-realm survival (#160)', () => {
  it('a listener registered at boot still fires from a fresh realm', async () => {
    const listener = vi.fn();
    registerMapPublishListener(listener);

    vi.resetModules();
    const fresh = await import('@/lib/framework/facilitation/map/publish-hooks');
    fresh.notifyMapPublished('weekly-reset', 'user_1');

    expect(listener).toHaveBeenCalledWith('weekly-reset', 'user_1');
  });

  it('both realms share one listener list, not two copies', async () => {
    const bootListener = vi.fn();
    registerMapPublishListener(bootListener);

    vi.resetModules();
    const fresh = await import('@/lib/framework/facilitation/map/publish-hooks');
    const requestListener = vi.fn();
    fresh.registerMapPublishListener(requestListener);

    notifyMapPublished('weekly-reset', null);

    expect(bootListener).toHaveBeenCalledTimes(1);
    expect(requestListener).toHaveBeenCalledTimes(1);
  });

  it('the test reset clears the shared list, not just the local binding', async () => {
    registerMapPublishListener(vi.fn());

    vi.resetModules();
    const fresh = await import('@/lib/framework/facilitation/map/publish-hooks');
    fresh.__resetMapPublishListenersForTests();

    const probe = vi.fn();
    registerMapPublishListener(probe);
    notifyMapPublished('weekly-reset', null);

    expect(probe).toHaveBeenCalledTimes(1);
  });
});

/**
 * Framework built-in capability registry (f-slot-capture t-1). The registry list + the
 * dispatcher-handler pass. `capabilityDispatcher` is mocked so the pass is observable
 * without the real dispatcher; the registry itself is pure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { dispatcherMock } = vi.hoisted(() => ({ dispatcherMock: { register: vi.fn() } }));
vi.mock('@/lib/orchestration/capabilities/dispatcher', () => ({
  capabilityDispatcher: dispatcherMock,
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  registerFrameworkCapability,
  getRegisteredFrameworkCapabilities,
  registerFrameworkCapabilityHandlers,
  __resetFrameworkCapabilitiesForTests,
} from '@/lib/framework/capabilities/registry';
import { logger } from '@/lib/logging';
import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';

// A minimal BaseCapability-shaped stub — the registry only reads `slug`.
const cap = (slug: string): BaseCapability => ({ slug }) as unknown as BaseCapability;

beforeEach(() => {
  vi.clearAllMocks();
  __resetFrameworkCapabilitiesForTests();
});

describe('registerFrameworkCapability', () => {
  it('collects registered capabilities in order', () => {
    registerFrameworkCapability(cap('get_state'));
    registerFrameworkCapability(cap('fill_slot'));
    expect(getRegisteredFrameworkCapabilities().map((c) => c.slug)).toEqual([
      'get_state',
      'fill_slot',
    ]);
  });

  it('dedupes by slug (last wins) and warns', () => {
    const first = cap('get_state');
    const second = cap('get_state');
    registerFrameworkCapability(first);
    registerFrameworkCapability(second);
    const all = getRegisteredFrameworkCapabilities();
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(second);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('registerFrameworkCapabilityHandlers', () => {
  it('registers every capability’s handler into the dispatcher', () => {
    registerFrameworkCapability(cap('get_state'));
    registerFrameworkCapability(cap('fill_slot'));
    registerFrameworkCapabilityHandlers();
    expect(dispatcherMock.register).toHaveBeenCalledTimes(2);
    expect(dispatcherMock.register.mock.calls.map((c) => c[0].slug)).toEqual([
      'get_state',
      'fill_slot',
    ]);
  });
});

/**
 * #160 — the realm split, framework-capability half.
 *
 * Same instrumentation/route module-graph split as the module registry (see
 * `tests/unit/lib/framework/modules/registry.test.ts` for the full note);
 * `vi.resetModules()` + re-import reproduces the second graph.
 *
 * The asymmetry worth pinning: runtime DISPATCH already survived the split,
 * because `registerFrameworkCapabilityHandlers()` flushes handlers into the
 * dispatcher and #462 made that `globalThis`-backed. What did not survive is
 * ENUMERATION — `getRegisteredFrameworkCapabilities()` came back empty on the
 * request path. That is the discrepancy these tests lock down.
 */
describe('cross-realm survival (#160)', () => {
  it('a boot-time registration is enumerable after a realm switch', async () => {
    registerFrameworkCapability(cap('get_state'));
    registerFrameworkCapability(cap('fill_slot'));

    vi.resetModules();
    const fresh = await import('@/lib/framework/capabilities/registry');

    expect(fresh.getRegisteredFrameworkCapabilities().map((c) => c.slug)).toEqual([
      'get_state',
      'fill_slot',
    ]);
  });

  it('the handler flush in a fresh realm still sees boot-registered capabilities', async () => {
    registerFrameworkCapability(cap('get_state'));

    vi.resetModules();
    const fresh = await import('@/lib/framework/capabilities/registry');
    fresh.registerFrameworkCapabilityHandlers();

    expect(dispatcherMock.register).toHaveBeenCalledTimes(1);
    expect(dispatcherMock.register.mock.calls[0][0].slug).toBe('get_state');
  });

  it('both realms share one registry rather than two copies', async () => {
    registerFrameworkCapability(cap('get_state'));

    vi.resetModules();
    const fresh = await import('@/lib/framework/capabilities/registry');
    fresh.registerFrameworkCapability(cap('fill_slot'));

    expect(getRegisteredFrameworkCapabilities().map((c) => c.slug)).toEqual([
      'get_state',
      'fill_slot',
    ]);
  });
});

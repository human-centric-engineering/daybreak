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

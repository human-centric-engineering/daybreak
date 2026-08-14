/**
 * Module registry unit tests.
 *
 * The registry is a pure in-memory `Map` keyed by slug. These tests pin the two
 * properties the boot sync and the leaf-registration seam rely on: registrations
 * accumulate, and re-registering a slug REPLACES (idempotent by slug — HMR /
 * repeat-import safe) rather than duplicating.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  registerModule,
  getRegisteredModules,
  getRegisteredModule,
  __resetModuleRegistryForTests,
} from '@/lib/framework/modules/registry';
import type { ModuleDefinition } from '@/lib/framework/modules/definition';

function def(slug: string, overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    slug,
    name: `Module ${slug}`,
    description: `The ${slug} module`,
    configSchema: z.object({}),
    ...overrides,
  };
}

beforeEach(() => {
  __resetModuleRegistryForTests();
});

describe('module registry', () => {
  it('starts empty', () => {
    expect(getRegisteredModules()).toEqual([]);
  });

  it('accumulates distinct modules in insertion order', () => {
    registerModule(def('alpha'));
    registerModule(def('beta'));

    expect(getRegisteredModules().map((m) => m.slug)).toEqual(['alpha', 'beta']);
  });

  it('is idempotent by slug — re-registering replaces, does not duplicate', () => {
    registerModule(def('alpha', { name: 'First' }));
    registerModule(def('alpha', { name: 'Second' }));

    const modules = getRegisteredModules();
    expect(modules).toHaveLength(1);
    expect(modules[0]?.name).toBe('Second');
  });

  it('returns a fresh array (mutating the result does not affect the registry)', () => {
    registerModule(def('alpha'));
    const first = getRegisteredModules();
    first.push(def('injected'));

    expect(getRegisteredModules().map((m) => m.slug)).toEqual(['alpha']);
  });
});

describe('getRegisteredModule (by slug)', () => {
  it('returns the registered definition for a known slug', () => {
    registerModule(def('alpha', { name: 'Alpha' }));
    expect(getRegisteredModule('alpha')?.name).toBe('Alpha');
  });

  it('returns undefined for an unregistered slug', () => {
    expect(getRegisteredModule('ghost')).toBeUndefined();
  });

  it('reflects the latest registration for a slug (idempotent by slug)', () => {
    registerModule(def('alpha', { name: 'First' }));
    registerModule(def('alpha', { name: 'Second' }));
    expect(getRegisteredModule('alpha')?.name).toBe('Second');
  });
});

/**
 * #160 — the realm split.
 *
 * Next 16 + Turbopack loads `instrumentation.ts` in a different module graph from
 * route handlers, so a module-scoped `Map` is a DIFFERENT object on the request
 * path than the one boot registered into. `vi.resetModules()` reproduces that
 * precisely: it drops the module-registry cache, so a re-import re-evaluates
 * `registry.ts` and rebinds every module-scoped `const` — exactly what the second
 * graph does. Only state parked on `globalThis` survives.
 *
 * These tests fail against a bare `const modules = new Map()` and pass once the
 * store is `globalThis`-backed, so they pin the fix rather than restating it.
 */
describe('cross-realm survival (#160)', () => {
  it('a registration made before a realm switch is visible after it', async () => {
    registerModule(def('alpha', { name: 'Registered at boot' }));

    vi.resetModules();
    const fresh = await import('@/lib/framework/modules/registry');

    expect(fresh.getRegisteredModule('alpha')?.name).toBe('Registered at boot');
    expect(fresh.getRegisteredModules().map((m) => m.slug)).toEqual(['alpha']);
  });

  it('both realms read and write ONE registry, not two copies', async () => {
    registerModule(def('alpha'));

    vi.resetModules();
    const fresh = await import('@/lib/framework/modules/registry');
    fresh.registerModule(def('beta'));

    // The request-realm write is visible to the boot realm's binding, and vice
    // versa — a two-copy registry would show one slug on each side.
    expect(getRegisteredModules().map((m) => m.slug)).toEqual(['alpha', 'beta']);
    expect(fresh.getRegisteredModules().map((m) => m.slug)).toEqual(['alpha', 'beta']);
  });

  it('the test reset clears the shared store, not just the local binding', async () => {
    registerModule(def('alpha'));

    vi.resetModules();
    const fresh = await import('@/lib/framework/modules/registry');
    fresh.__resetModuleRegistryForTests();

    expect(getRegisteredModules()).toEqual([]);
  });
});

/**
 * Module registry unit tests.
 *
 * The registry is a pure in-memory `Map` keyed by slug. These tests pin the two
 * properties the boot sync and the leaf-registration seam rely on: registrations
 * accumulate, and re-registering a slug REPLACES (idempotent by slug — HMR /
 * repeat-import safe) rather than duplicating.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

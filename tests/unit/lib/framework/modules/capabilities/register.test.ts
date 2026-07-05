/**
 * In-memory module-capability registration (f-module-bindings t-2).
 *
 * Mocks the global dispatcher and asserts `registerRegisteredModuleCapabilities()`
 * registers each registered module's capabilities under their namespaced slug. The
 * module registry is real (`registerModule`).
 *
 * @see lib/framework/modules/capabilities/register.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityFunctionDefinition,
  CapabilitySchema,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';

const dispatcher = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('@/lib/orchestration/capabilities/dispatcher', () => ({
  capabilityDispatcher: dispatcher,
}));

const { registerRegisteredModuleCapabilities } =
  await import('@/lib/framework/modules/capabilities/register');
const { registerModule, __resetModuleRegistryForTests } =
  await import('@/lib/framework/modules/registry');

class Tool extends BaseCapability {
  readonly slug: string;
  readonly functionDefinition: CapabilityFunctionDefinition;
  protected readonly schema: CapabilitySchema<unknown> = z.object({});
  constructor(slug: string) {
    super();
    this.slug = slug;
    this.functionDefinition = { name: slug, description: slug, parameters: {} };
  }
  async execute(): Promise<CapabilityResult> {
    return this.success({});
  }
}

function registerModuleWithCaps(slug: string, caps: BaseCapability[]): void {
  registerModule({
    slug,
    name: slug,
    description: slug,
    configSchema: z.object({}),
    capabilities: caps,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetModuleRegistryForTests();
});

describe('registerRegisteredModuleCapabilities', () => {
  it('registers each module capability under its namespaced slug', () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet'), new Tool('read_progress')]);
    registerModuleWithCaps('writing', [new Tool('save_worksheet')]);

    registerRegisteredModuleCapabilities();

    const registeredSlugs = dispatcher.register.mock.calls.map((c) => c[0].slug).sort();
    expect(registeredSlugs).toEqual([
      'reading__read_progress',
      'reading__save_worksheet',
      'writing__save_worksheet',
    ]);
  });

  it('is a no-op when a module declares an empty capabilities list', () => {
    registerModuleWithCaps('reading', []);
    registerRegisteredModuleCapabilities();
    expect(dispatcher.register).not.toHaveBeenCalled();
  });

  it('is a no-op when a module omits the capabilities field entirely', () => {
    // No `capabilities` key at all — exercises the `?? []` fallback.
    registerModule({
      slug: 'reading',
      name: 'reading',
      description: 'x',
      configSchema: z.object({}),
    });
    registerRegisteredModuleCapabilities();
    expect(dispatcher.register).not.toHaveBeenCalled();
  });

  it('throws (fail-fast at boot) on a non-snake_case tool slug', () => {
    registerModuleWithCaps('reading', [new Tool('save-worksheet')]);
    expect(() => registerRegisteredModuleCapabilities()).toThrow(/snake_case/);
  });
});

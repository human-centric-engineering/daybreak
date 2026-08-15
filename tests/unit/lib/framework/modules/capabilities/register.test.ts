/**
 * In-memory module-capability registration (f-module-bindings t-2).
 *
 * Mocks the global dispatcher and asserts `registerRegisteredModuleCapabilities()`
 * registers each registered module's capabilities **as themselves** under their
 * namespaced slug, with a module-scope guard (the core `register(cap, { slug, guard })`
 * seam — v1.3 Phase 1 t-1.2). The module registry is real (`registerModule`).
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
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { registerRegisteredModuleCapabilities } =
  await import('@/lib/framework/modules/capabilities/register');
const { logger } = await import('@/lib/logging');
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

    const registeredSlugs = dispatcher.register.mock.calls.map((c) => c[1].slug).sort();
    expect(registeredSlugs).toEqual([
      'reading__read_progress',
      'reading__save_worksheet',
      'writing__save_worksheet',
    ]);
  });

  it("hands the dispatcher the author's own capability instance, not a wrapper", () => {
    // Load-bearing: the dispatcher's PII guard is an own-property check on the
    // instance's prototype, which any delegating wrapper would pass unconditionally.
    const tool = new Tool('save_worksheet');
    registerModuleWithCaps('reading', [tool]);

    registerRegisteredModuleCapabilities();

    const [capability, options] = dispatcher.register.mock.calls[0];
    expect(capability).toBe(tool);
    expect(capability.slug).toBe('save_worksheet'); // the author's slug is not rewritten
    expect(options.slug).toBe('reading__save_worksheet');
  });

  it('attaches a guard that refuses a call pinned to another module', async () => {
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);

    registerRegisteredModuleCapabilities();

    const guard = dispatcher.register.mock.calls[0][1].guard;
    const context = { userId: 'u1', agentId: 'a1' };
    expect(await guard({ ...context, scope: { moduleSlug: 'reading' } })).toEqual({ allow: true });
    expect(await guard(context)).toEqual({ allow: true }); // nothing pinned
    expect((await guard({ ...context, scope: { moduleSlug: 'writing' } })).allow).toBe(false);
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

  it('skips a non-snake_case tool slug, logs it, and keeps registering its siblings', () => {
    // Fail-soft per capability: the throw used to escape into `syncFramework()`, whose
    // caller logs and continues — so one bad tool skipped every later boot step and left
    // the app with no framework capabilities at all.
    registerModuleWithCaps('reading', [new Tool('save-worksheet'), new Tool('read_progress')]);

    expect(() => registerRegisteredModuleCapabilities()).not.toThrow();

    expect(dispatcher.register.mock.calls.map((c) => c[1].slug)).toEqual([
      'reading__read_progress',
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('rejected'),
      expect.objectContaining({ moduleSlug: 'reading', capabilitySlug: 'save-worksheet' })
    );
  });

  it('logs a non-Error throw as a string rather than crashing the loop', () => {
    // The dispatcher's own guards throw Errors, but a capability's getter or a leaf's
    // subclass could throw anything; the handler must not itself throw while reporting.
    registerModuleWithCaps('reading', [new Tool('save_worksheet')]);
    // The rule below governs what OUR code throws; the branch under test exists precisely
    // for callers that ignore it, so simulating one is the point.
    dispatcher.register.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberate: see above
      throw 'not an Error';
    });

    expect(() => registerRegisteredModuleCapabilities()).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ error: 'not an Error' })
    );
  });

  it('a rejected capability in one module does not stop another module registering', () => {
    registerModuleWithCaps('reading', [new Tool('save-worksheet')]);
    registerModuleWithCaps('writing', [new Tool('save_draft')]);

    registerRegisteredModuleCapabilities();

    expect(dispatcher.register.mock.calls.map((c) => c[1].slug)).toEqual(['writing__save_draft']);
  });
});

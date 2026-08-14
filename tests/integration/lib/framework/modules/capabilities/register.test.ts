/**
 * Module-capability registration against the **real** dispatcher (v1.3 Phase 1 t-1.2).
 *
 * The unit test alongside this one mocks the dispatcher to assert what
 * `registerRegisteredModuleCapabilities()` passes it. This one uses the real
 * `capabilityDispatcher` to prove the contracts that used to be re-asserted by the
 * fork's own wrapper and are now core's job:
 *
 * - a `processesPii` module capability that does not override `redactProvenance()`
 *   still fails **at boot** (`register()` throws) — deleting
 *   `namespaceModuleCapability`'s re-assertion did not open the hole its
 *   "LOAD-BEARING" comment warned about, because core inspects the real instance
 *   rather than a delegating wrapper;
 * - the handler lands under the **namespaced** slug, not the author's bare one.
 *
 * Prisma is mocked (no live DB); nothing here dispatches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import type {
  CapabilityFunctionDefinition,
  CapabilityResult,
  CapabilitySchema,
} from '@/lib/orchestration/capabilities/types';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiCapability: { findMany: vi.fn().mockResolvedValue([]) },
    aiAgentCapability: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { BaseCapability } = await import('@/lib/orchestration/capabilities/base-capability');
const { capabilityDispatcher } = await import('@/lib/orchestration/capabilities/dispatcher');
const { registerRegisteredModuleCapabilities } =
  await import('@/lib/framework/modules/capabilities/register');
const { registerModule, __resetModuleRegistryForTests } =
  await import('@/lib/framework/modules/registry');

/** A well-behaved, non-PII module tool. */
class SaveWorksheet extends BaseCapability {
  readonly slug = 'save_worksheet';
  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'save_worksheet',
    description: 'Persist the current worksheet',
    parameters: {},
  };
  protected readonly schema: CapabilitySchema<unknown> = z.object({});
  async execute(): Promise<CapabilityResult> {
    return this.success({});
  }
}

/** A PII tool that (wrongly) leaves `redactProvenance()` at the base implementation. */
class GrabEmail extends BaseCapability {
  readonly slug = 'grab_email';
  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'grab_email',
    description: 'Read the learner’s email',
    parameters: {},
  };
  protected readonly schema: CapabilitySchema<unknown> = z.object({});
  readonly processesPii = true;
  async execute(): Promise<CapabilityResult> {
    return this.success({});
  }
}

/** The same tool, redacting as the contract requires. */
class GrabEmailRedacting extends GrabEmail {
  override redactProvenance(): ReturnType<InstanceType<typeof BaseCapability>['redactProvenance']> {
    return { args: {}, resultPreview: '[redacted]' };
  }
}

function registerModuleWithCaps(slug: string, caps: InstanceType<typeof BaseCapability>[]): void {
  registerModule({
    slug,
    name: slug,
    description: slug,
    configSchema: z.object({}),
    capabilities: caps,
  });
}

beforeEach(() => {
  __resetModuleRegistryForTests();
});

describe('registerRegisteredModuleCapabilities (real dispatcher)', () => {
  it('registers the handler under the namespaced slug, not the bare one', () => {
    registerModuleWithCaps('reading', [new SaveWorksheet()]);

    registerRegisteredModuleCapabilities();

    expect(capabilityDispatcher.has('reading__save_worksheet')).toBe(true);
    expect(capabilityDispatcher.getHandler('reading__save_worksheet')).toBeInstanceOf(
      SaveWorksheet
    );
  });

  it('throws at boot for a processesPii capability that does not redact', () => {
    registerModuleWithCaps('reading', [new GrabEmail()]);

    // Core's own guard, run against the author's real prototype — the check the fork
    // used to duplicate because a wrapper defeated it.
    expect(() => registerRegisteredModuleCapabilities()).toThrow(/redactProvenance/);
    expect(capabilityDispatcher.has('reading__grab_email')).toBe(false);
  });

  it('accepts the same PII capability once it overrides redactProvenance', () => {
    registerModuleWithCaps('reading', [new GrabEmailRedacting()]);

    expect(() => registerRegisteredModuleCapabilities()).not.toThrow();
    expect(capabilityDispatcher.has('reading__grab_email')).toBe(true);
  });
});

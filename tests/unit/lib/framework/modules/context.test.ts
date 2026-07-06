/**
 * The "module" prompt-context contributor (f-guidance t-4). Proves the loader composes the
 * registered module's name + description (user-agnostic — safe with core's per-(type,id)
 * cache), and falls back to the "unavailable" body for an unregistered slug.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { loadModuleContext, MODULE_CONTEXT_UNAVAILABLE } from '@/lib/framework/modules/context';
import { registerModule, __resetModuleRegistryForTests } from '@/lib/framework/modules/registry';

const definition = (over: Record<string, unknown> = {}) => ({
  slug: 'onboarding',
  name: 'Onboarding',
  description: 'Gets a new user started.',
  configSchema: z.object({}),
  ...over,
});

beforeEach(() => __resetModuleRegistryForTests());

describe('loadModuleContext', () => {
  it('composes the module name + description for a registered slug', async () => {
    registerModule(definition());
    await expect(loadModuleContext('onboarding')).resolves.toBe(
      'Module: Onboarding\nGets a new user started.'
    );
  });

  it('returns the unavailable body for an unregistered slug', async () => {
    registerModule(definition()); // a different module is registered…
    await expect(loadModuleContext('not-a-module')).resolves.toBe(MODULE_CONTEXT_UNAVAILABLE);
  });

  it('is user-agnostic — the body depends only on the slug (safe with the (type,id) cache)', async () => {
    registerModule(definition());
    const a = await loadModuleContext('onboarding');
    const b = await loadModuleContext('onboarding');
    expect(a).toBe(b); // no per-user input can vary it
  });
});

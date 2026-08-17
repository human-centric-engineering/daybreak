/**
 * Module capability namespacing + scope refusal (f-module-bindings t-2).
 *
 * Pure unit tests: the namespaced slug / provider-legal function name derivations,
 * the scope-refusal predicate, the identity derivation (including snake_case
 * validation), and the guard handed to the core `register()` seam. No DB, no
 * dispatcher — and, since v1.3 Phase 1 t-1.2, no wrapper to test either: delegation
 * and the PII re-assertion are the dispatcher's job now.
 *
 * @see lib/framework/modules/capabilities/namespace.ts
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
  CapabilitySchema,
} from '@/lib/orchestration/capabilities/types';
import {
  moduleCapabilitySlug,
  isInModuleScope,
  moduleCapabilityIdentity,
  moduleScopeGuard,
} from '@/lib/framework/modules/capabilities/namespace';

/** A minimal well-formed module capability. */
class SaveWorksheet extends BaseCapability<{ text: string }, { saved: boolean }> {
  readonly slug: string;
  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'save_worksheet',
    description: 'Persist the current worksheet',
    parameters: { type: 'object', properties: {} },
  };
  protected readonly schema: CapabilitySchema<{ text: string }> = z.object({ text: z.string() });
  constructor(slug = 'save_worksheet') {
    super();
    this.slug = slug;
  }
  async execute(args: { text: string }): Promise<CapabilityResult<{ saved: boolean }>> {
    return this.success({ saved: args.text.length > 0 });
  }
}

const ctx = (scope?: Record<string, string>): CapabilityContext => ({
  userId: 'u1',
  agentId: 'a1',
  ...(scope ? { scope } : {}),
});

describe('moduleCapabilitySlug', () => {
  it('is the provider-legal namespaced identifier (no dot; module underscored)', () => {
    const slug = moduleCapabilitySlug('reading-app', 'save_worksheet');
    expect(slug).toBe('reading_app__save_worksheet');
    // Must be a legal OpenAI tool name — this string is also functionDefinition.name.
    expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(slug).not.toContain('.');
  });

  it('is collision-free across different (module, tool) splits', () => {
    // module `reading` + tool `app_save` vs module `reading-app` + tool `save`:
    // the `__` joiner keeps them distinct where a naive `.`→`_` would collide.
    expect(moduleCapabilitySlug('reading', 'app_save')).toBe('reading__app_save');
    expect(moduleCapabilitySlug('reading-app', 'save')).toBe('reading_app__save');
    expect(moduleCapabilitySlug('reading', 'app_save')).not.toBe(
      moduleCapabilitySlug('reading-app', 'save')
    );
  });
});

describe('isInModuleScope', () => {
  it('allows when no module scope is pinned (interim posture)', () => {
    expect(isInModuleScope(ctx(), 'reading')).toBe(true);
    expect(isInModuleScope(ctx({ nodeKey: 'n1' }), 'reading')).toBe(true);
  });
  it('allows when the pinned module matches', () => {
    expect(isInModuleScope(ctx({ moduleSlug: 'reading' }), 'reading')).toBe(true);
  });
  it('refuses when the pinned module differs', () => {
    expect(isInModuleScope(ctx({ moduleSlug: 'writing' }), 'reading')).toBe(false);
  });
});

describe('moduleCapabilityIdentity', () => {
  it('derives the namespaced slug, and functionDefinition.name EQUALS the slug', () => {
    const identity = moduleCapabilityIdentity('reading', new SaveWorksheet());
    expect(identity.slug).toBe('reading__save_worksheet');
    // The dispatcher looks a handler up by the tool name the LLM calls, and only
    // surfaces a capability whose ai_capability.slug is a registered handler — so
    // slug and functionDefinition.name MUST be identical or the tool never dispatches.
    expect(identity.functionDefinition.name).toBe(identity.slug);
    expect(identity.functionDefinition.description).toBe('Persist the current worksheet');
  });

  it("leaves the author's capability untouched (the definition is copied, not renamed)", () => {
    const capability = new SaveWorksheet();
    moduleCapabilityIdentity('reading', capability);
    expect(capability.functionDefinition.name).toBe('save_worksheet');
    expect(capability.slug).toBe('save_worksheet');
  });

  it('rejects a module slug that would make the namespaced identifier ambiguous', () => {
    // `-`→`_` must not be able to produce a `__`, or two different modules can namespace
    // to the same identifier and the second registration silently replaces the first.
    expect(() => moduleCapabilityIdentity('read_ing', new SaveWorksheet())).toThrow(
      /single dashes/
    );
    expect(() => moduleCapabilityIdentity('read--ing', new SaveWorksheet())).toThrow();
    // …and anything outside [A-Za-z0-9-] is not a legal provider tool name.
    expect(() => moduleCapabilityIdentity('read ing', new SaveWorksheet())).toThrow();
    expect(() => moduleCapabilityIdentity('read.ing', new SaveWorksheet())).toThrow();
  });

  it('is the collision the module-slug rule prevents', () => {
    // The pair that motivates the rule: without it both namespace to `read_ing__save_worksheet`.
    expect(moduleCapabilitySlug('read-ing', 'save_worksheet')).toBe(
      moduleCapabilitySlug('read_ing', 'save_worksheet')
    );
    expect(() => moduleCapabilityIdentity('read-ing', new SaveWorksheet())).not.toThrow();
    expect(() => moduleCapabilityIdentity('read_ing', new SaveWorksheet())).toThrow();
  });

  it('allows an uppercase module slug — legal as a tool name, so not our business', () => {
    // `slugSchema` is lowercase-only elsewhere, but this regex enforces the invariant, not
    // a house style; refusing `Reading` would break a leaf that works today for no gain.
    expect(moduleCapabilityIdentity('Reading', new SaveWorksheet()).slug).toBe(
      'Reading__save_worksheet'
    );
  });

  it('rejects a non-snake_case tool slug', () => {
    expect(() => moduleCapabilityIdentity('reading', new SaveWorksheet('save-worksheet'))).toThrow(
      /snake_case/
    );
    expect(() => moduleCapabilityIdentity('reading', new SaveWorksheet('saveWorksheet'))).toThrow();
    expect(() =>
      moduleCapabilityIdentity('reading', new SaveWorksheet('save.worksheet'))
    ).toThrow();
    expect(() => moduleCapabilityIdentity('reading', new SaveWorksheet('_save'))).toThrow();
  });
});

describe('moduleScopeGuard', () => {
  it('allows a call pinned to the same module', async () => {
    expect(await moduleScopeGuard('reading')(ctx({ moduleSlug: 'reading' }))).toEqual({
      allow: true,
    });
  });

  it('allows a call with no module pinned (interim posture)', async () => {
    expect(await moduleScopeGuard('reading')(ctx())).toEqual({ allow: true });
  });

  it('denies a call pinned to a different module, with a client-safe reason', async () => {
    const decision = await moduleScopeGuard('reading')(ctx({ moduleSlug: 'writing' }));
    expect(decision.allow).toBe(false);
    // The dispatcher folds `reason` verbatim into a client-visible message, so it may
    // name the module (already public in the tool's slug) and nothing else.
    expect(decision.reason).toContain('reading');
    expect(decision.reason).not.toContain('a1'); // no agent id
    expect(decision.reason).not.toContain('u1'); // no user id
  });
});

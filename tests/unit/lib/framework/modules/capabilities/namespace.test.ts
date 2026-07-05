/**
 * Module capability namespacing + scope refusal (f-module-bindings t-2).
 *
 * Pure unit tests: the namespaced slug / provider-legal function name derivations,
 * the scope-refusal predicate, and the wrapper (delegation, scope enforcement in
 * `execute`, snake_case validation, and the PII re-assertion). No DB, no dispatcher.
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
  namespaceModuleCapability,
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

/** A PII capability that (wrongly) does not override redactProvenance. */
class PiiNoRedact extends BaseCapability<{ email: string }> {
  readonly slug = 'grab_email';
  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'grab_email',
    description: 'x',
    parameters: {},
  };
  protected readonly schema: CapabilitySchema<{ email: string }> = z.object({ email: z.string() });
  readonly processesPii = true;
  async execute(): Promise<CapabilityResult> {
    return this.success({});
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

describe('namespaceModuleCapability', () => {
  it('presents the namespaced slug, and functionDefinition.name EQUALS the slug', () => {
    const wrapped = namespaceModuleCapability('reading', new SaveWorksheet());
    expect(wrapped.slug).toBe('reading__save_worksheet');
    // The dispatcher looks a handler up by the tool name the LLM calls, and only
    // surfaces a capability whose ai_capability.slug is a registered handler — so
    // slug and functionDefinition.name MUST be identical or the tool never dispatches.
    expect(wrapped.functionDefinition.name).toBe(wrapped.slug);
    expect(wrapped.functionDefinition.description).toBe('Persist the current worksheet');
  });

  it('delegates validate to the inner capability', () => {
    const wrapped = namespaceModuleCapability('reading', new SaveWorksheet());
    expect(wrapped.validate({ text: 'hi' })).toEqual({ text: 'hi' });
    expect(() => wrapped.validate({ text: 123 })).toThrow();
  });

  it('delegates execute when in scope', async () => {
    const wrapped = namespaceModuleCapability('reading', new SaveWorksheet());
    const res = await wrapped.execute({ text: 'hi' }, ctx({ moduleSlug: 'reading' }));
    expect(res).toMatchObject({ success: true, data: { saved: true } });
  });

  it('refuses out-of-scope with a structured error, without calling inner', async () => {
    const inner = new SaveWorksheet();
    let ran = false;
    inner.execute = async () => {
      ran = true;
      return { success: true };
    };
    const wrapped = namespaceModuleCapability('reading', inner);
    const res = await wrapped.execute({ text: 'hi' }, ctx({ moduleSlug: 'writing' }));
    expect(res).toMatchObject({ success: false, error: { code: 'out_of_module_scope' } });
    expect(ran).toBe(false);
  });

  it('runs when no scope is pinned (interim posture)', async () => {
    const wrapped = namespaceModuleCapability('reading', new SaveWorksheet());
    const res = await wrapped.execute({ text: 'x' }, ctx());
    expect(res.success).toBe(true);
  });

  it('rejects a non-snake_case tool slug', () => {
    expect(() => namespaceModuleCapability('reading', new SaveWorksheet('save-worksheet'))).toThrow(
      /snake_case/
    );
    expect(() =>
      namespaceModuleCapability('reading', new SaveWorksheet('saveWorksheet'))
    ).toThrow();
    expect(() =>
      namespaceModuleCapability('reading', new SaveWorksheet('save.worksheet'))
    ).toThrow();
    expect(() => namespaceModuleCapability('reading', new SaveWorksheet('_save'))).toThrow();
  });

  it('rejects a PII capability that does not override redactProvenance', () => {
    expect(() => namespaceModuleCapability('reading', new PiiNoRedact())).toThrow(
      /redactProvenance/
    );
  });

  it('propagates the inner processesPii flag', () => {
    const wrapped = namespaceModuleCapability('reading', new SaveWorksheet());
    expect(wrapped.processesPii).toBe(false);
  });

  it('delegates redactProvenance to the inner capability', () => {
    const inner = new SaveWorksheet();
    const redaction = { args: { text: '***' }, resultPreview: 'redacted' };
    inner.redactProvenance = () => redaction;
    const wrapped = namespaceModuleCapability('reading', inner);
    expect(wrapped.redactProvenance({ text: 'secret' }, { success: true })).toBe(redaction);
  });
});

/**
 * Facilitation binding API schemas (f-facilitation-agents t-1). Pure.
 */

import { describe, it, expect } from 'vitest';
import {
  bindFacilitationAgentBodySchema,
  updateFacilitationBindingBodySchema,
  parseFacilitationBindingId,
} from '@/lib/framework/facilitation/agents/api-schemas';
import { ValidationError } from '@/lib/api/errors';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('bindFacilitationAgentBodySchema', () => {
  it('accepts a valid bind body', () => {
    expect(
      bindFacilitationAgentBodySchema.safeParse({ agentId: CUID, role: 'onboarding' }).success
    ).toBe(true);
  });

  it('rejects a missing role or a non-cuid agentId', () => {
    expect(bindFacilitationAgentBodySchema.safeParse({ agentId: CUID }).success).toBe(false);
    expect(bindFacilitationAgentBodySchema.safeParse({ agentId: 'nope', role: 'x' }).success).toBe(
      false
    );
  });
});

describe('updateFacilitationBindingBodySchema', () => {
  it('accepts an object or null config', () => {
    expect(
      updateFacilitationBindingBodySchema.safeParse({ config: { tone: 'warm' } }).success
    ).toBe(true);
    expect(updateFacilitationBindingBodySchema.safeParse({ config: null }).success).toBe(true);
  });
});

describe('parseFacilitationBindingId', () => {
  it('returns a valid cuid and throws on a malformed one', () => {
    expect(parseFacilitationBindingId(CUID)).toBe(CUID);
    expect(() => parseFacilitationBindingId('not-a-cuid')).toThrow(ValidationError);
  });
});

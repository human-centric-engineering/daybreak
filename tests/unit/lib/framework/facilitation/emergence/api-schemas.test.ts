/**
 * Proposal admin API schemas (f-emergence t-3). Pure — outer-shape validation only.
 */

import { describe, it, expect } from 'vitest';
import {
  submitProposalBodySchema,
  rejectProposalBodySchema,
  parseProposalId,
} from '@/lib/framework/facilitation/emergence/api-schemas';
import { ValidationError } from '@/lib/api/errors';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('submitProposalBodySchema', () => {
  it('accepts a map proposal (with optional agent author)', () => {
    expect(
      submitProposalBodySchema.safeParse({
        subjectType: 'map',
        subjectId: 'g',
        proposedDefinition: { nodes: [] },
      }).success
    ).toBe(true);
    expect(
      submitProposalBodySchema.safeParse({
        subjectType: 'map',
        subjectId: 'g',
        proposedDefinition: {},
        authorAgentSlug: 'onboarding',
      }).success
    ).toBe(true);
  });

  it('accepts the widened module_config and policy subjects', () => {
    expect(
      submitProposalBodySchema.safeParse({
        subjectType: 'module_config',
        subjectId: 'welcome',
        proposedDefinition: { greeting: 'hi' },
      }).success
    ).toBe(true);
    expect(
      submitProposalBodySchema.safeParse({
        subjectType: 'policy',
        subjectId: 'cjld2cjxh0000qzrmn831i7rn', // a policy id
        proposedDefinition: { mode: 'none' },
      }).success
    ).toBe(true);
  });

  it('rejects an unknown subjectType or a missing subjectId', () => {
    expect(
      submitProposalBodySchema.safeParse({ subjectType: 'workflow', subjectId: 'g' }).success
    ).toBe(false);
    expect(submitProposalBodySchema.safeParse({ subjectType: 'map' }).success).toBe(false);
  });
});

describe('rejectProposalBodySchema', () => {
  it('requires a non-empty reason', () => {
    expect(rejectProposalBodySchema.safeParse({ reason: 'off-scope' }).success).toBe(true);
    expect(rejectProposalBodySchema.safeParse({ reason: '' }).success).toBe(false);
    expect(rejectProposalBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('parseProposalId', () => {
  it('returns a valid cuid and throws on a malformed one', () => {
    expect(parseProposalId(CUID)).toBe(CUID);
    expect(() => parseProposalId('not-a-cuid')).toThrow(ValidationError);
  });
});

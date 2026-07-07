/**
 * Facilitation policy API schemas (f-policies t-1). Pure — outer-shape validation only (the
 * kind↔payload check lives in the service).
 */

import { describe, it, expect } from 'vitest';
import {
  createFacilitationPolicyBodySchema,
  updateFacilitationPolicyBodySchema,
  parseFacilitationPolicyId,
} from '@/lib/framework/facilitation/policies/api-schemas';
import { ValidationError } from '@/lib/api/errors';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('createFacilitationPolicyBodySchema', () => {
  it('accepts a kind + payload (+ optional enabled)', () => {
    expect(
      createFacilitationPolicyBodySchema.safeParse({
        kind: 'auto_approval',
        payload: { autoApprove: 'none' },
      }).success
    ).toBe(true);
    expect(
      createFacilitationPolicyBodySchema.safeParse({
        kind: 'auto_approval',
        payload: {},
        enabled: false,
      }).success
    ).toBe(true);
  });

  it('rejects a missing/blank kind', () => {
    expect(createFacilitationPolicyBodySchema.safeParse({ payload: {} }).success).toBe(false);
    expect(createFacilitationPolicyBodySchema.safeParse({ kind: '', payload: {} }).success).toBe(
      false
    );
  });
});

describe('updateFacilitationPolicyBodySchema', () => {
  it('accepts payload and/or enabled', () => {
    expect(updateFacilitationPolicyBodySchema.safeParse({ enabled: false }).success).toBe(true);
    expect(
      updateFacilitationPolicyBodySchema.safeParse({ payload: { autoApprove: 'none' } }).success
    ).toBe(true);
  });

  it('rejects an empty body (nothing to update)', () => {
    expect(updateFacilitationPolicyBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('parseFacilitationPolicyId', () => {
  it('returns a valid cuid and throws on a malformed one', () => {
    expect(parseFacilitationPolicyId(CUID)).toBe(CUID);
    expect(() => parseFacilitationPolicyId('not-a-cuid')).toThrow(ValidationError);
  });
});

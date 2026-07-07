/**
 * Facilitation policy kinds (f-policies t-1). Pure. Proves the discriminated union enforces
 * kind↔payload integrity: a valid `auto_approval`, an unknown kind, and a payload that doesn't
 * match its kind all resolve correctly (validated data or a `ValidationError`).
 */

import { describe, it, expect } from 'vitest';
import {
  assertValidFacilitationPolicy,
  facilitationPolicySchema,
  FACILITATION_POLICY_KINDS,
} from '@/lib/framework/facilitation/policies/kinds';
import { ValidationError } from '@/lib/api/errors';

describe('FACILITATION_POLICY_KINDS', () => {
  it('declares auto_approval as a shipped kind (t-1)', () => {
    expect(FACILITATION_POLICY_KINDS).toContain('auto_approval');
  });

  it('stays in lockstep with the discriminated union members (drift guard)', () => {
    // The const and the union are two of the three places a kind lives (the migration CHECK is
    // the third); if a future task adds a union member but forgets the const, this fails.
    const unionKinds = facilitationPolicySchema.options.map((o) => o.shape.kind.value).sort();
    expect([...FACILITATION_POLICY_KINDS].sort()).toEqual(unionKinds);
  });
});

describe('assertValidFacilitationPolicy', () => {
  it('accepts a valid auto_approval policy and returns the typed pair', () => {
    const result = assertValidFacilitationPolicy('auto_approval', { autoApprove: 'none' });
    expect(result).toEqual({ kind: 'auto_approval', payload: { autoApprove: 'none' } });
  });

  it('accepts low_risk structurally (forward-compat for f-emergence)', () => {
    expect(() =>
      assertValidFacilitationPolicy('auto_approval', { autoApprove: 'low_risk' })
    ).not.toThrow();
  });

  it('rejects an unknown kind (ValidationError)', () => {
    expect(() => assertValidFacilitationPolicy('made_up', { autoApprove: 'none' })).toThrow(
      ValidationError
    );
  });

  it('rejects a payload that does not match the kind (bad enum value)', () => {
    expect(() => assertValidFacilitationPolicy('auto_approval', { autoApprove: 'always' })).toThrow(
      ValidationError
    );
  });

  it('rejects an unknown payload field (strict) and a missing field', () => {
    expect(() =>
      assertValidFacilitationPolicy('auto_approval', { autoApprove: 'none', extra: 1 })
    ).toThrow(ValidationError);
    expect(() => assertValidFacilitationPolicy('auto_approval', {})).toThrow(ValidationError);
  });
});

describe('facilitationPolicySchema (the discriminated union)', () => {
  it('rejects a mismatched kind/payload at the schema level', () => {
    expect(
      facilitationPolicySchema.safeParse({ kind: 'auto_approval', payload: null }).success
    ).toBe(false);
  });
});

/**
 * Facilitation seat vocabulary (f-facilitation-agents t-1). Pure.
 */

import { describe, it, expect } from 'vitest';
import {
  FACILITATION_ROLES,
  FACILITATION_ROLE_VALUES,
  isFacilitationRole,
} from '@/lib/framework/facilitation/agents/roles';

describe('FACILITATION_ROLES', () => {
  it('declares the six facilitation seats', () => {
    expect(FACILITATION_ROLE_VALUES).toEqual([
      'onboarding',
      'orientation',
      'synopsis',
      'state',
      'path',
      'facilitator',
    ]);
  });

  it('keeps each key equal to its value (stable identifiers)', () => {
    for (const [k, v] of Object.entries(FACILITATION_ROLES)) expect(k).toBe(v);
  });
});

describe('isFacilitationRole', () => {
  it('accepts a declared seat and rejects anything else', () => {
    expect(isFacilitationRole('facilitator')).toBe(true);
    expect(isFacilitationRole('module_primary')).toBe(false);
    expect(isFacilitationRole('')).toBe(false);
  });
});

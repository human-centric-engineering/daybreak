/**
 * Unit test — module settings API schemas (f-ops-views t-3).
 *
 * The PATCH envelope for `/modules/[slug]`: partial (each field optional), nullable on the
 * clearable fields, strict (unknown keys rejected), and non-empty (a no-op PATCH is a 400).
 * The window bounds must be ISO-8601; cross-field coherence is the service's job, not here.
 *
 * @see lib/framework/modules/api-schemas.ts
 */

import { describe, it, expect } from 'vitest';
import { updateModuleBodySchema, parseModuleSlug } from '@/lib/framework/modules/api-schemas';
import { ValidationError } from '@/lib/api/errors';

describe('updateModuleBodySchema', () => {
  it('accepts a partial update (only the sent fields)', () => {
    const parsed = updateModuleBodySchema.parse({ name: 'New name' });
    expect(parsed).toEqual({ name: 'New name' });
  });

  it('accepts null to clear the flag and window bounds', () => {
    const parsed = updateModuleBodySchema.parse({
      featureFlagName: null,
      availableFrom: null,
      availableUntil: null,
    });
    expect(parsed).toEqual({
      featureFlagName: null,
      availableFrom: null,
      availableUntil: null,
    });
  });

  it('accepts ISO-8601 window bounds', () => {
    const parsed = updateModuleBodySchema.parse({ availableFrom: '2026-02-01T10:00:00.000Z' });
    expect(parsed.availableFrom).toBe('2026-02-01T10:00:00.000Z');
  });

  it('trims and preserves free-form status / audience', () => {
    const parsed = updateModuleBodySchema.parse({ status: '  retired  ', audience: 'invite' });
    expect(parsed).toEqual({ status: 'retired', audience: 'invite' });
  });

  it('rejects an empty body (no-op PATCH)', () => {
    expect(() => updateModuleBodySchema.parse({})).toThrow();
  });

  it('rejects unknown keys (config / slug / isRegistered are owned elsewhere)', () => {
    expect(() => updateModuleBodySchema.parse({ name: 'x', config: {} })).toThrow();
    expect(() => updateModuleBodySchema.parse({ isRegistered: false })).toThrow();
  });

  it('rejects a non-ISO window bound', () => {
    expect(() => updateModuleBodySchema.parse({ availableFrom: '2026-02-01' })).toThrow();
  });

  it('rejects an empty name / status / audience', () => {
    expect(() => updateModuleBodySchema.parse({ name: '   ' })).toThrow();
    expect(() => updateModuleBodySchema.parse({ status: '' })).toThrow();
  });
});

describe('parseModuleSlug', () => {
  it('accepts a valid slug', () => {
    expect(parseModuleSlug('onboarding-flow')).toBe('onboarding-flow');
  });

  it('throws ValidationError (400) on a malformed slug', () => {
    expect(() => parseModuleSlug('Not A Slug')).toThrow(ValidationError);
  });
});

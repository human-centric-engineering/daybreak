/**
 * Shared framework route-param parsers (extracted at the rule of three).
 *
 * Pure functions — a valid slug/cuid passes through; a malformed one raises a
 * `ValidationError` (a 400, not a 404) with the entity-labelled message and the
 * right details key.
 *
 * @see lib/framework/shared/route-params.ts
 */

import { describe, it, expect } from 'vitest';
import { parseSlugParam, parseCuidParam } from '@/lib/framework/shared/route-params';
import { ValidationError } from '@/lib/api/errors';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('parseSlugParam', () => {
  it('returns a valid slug unchanged', () => {
    expect(parseSlugParam('reading-lab', 'module')).toBe('reading-lab');
  });

  it('throws a ValidationError for a malformed slug (uppercase, spaces)', () => {
    expect(() => parseSlugParam('BAD SLUG', 'module')).toThrow(ValidationError);
  });

  it('labels the error message with the entity', () => {
    expect(() => parseSlugParam('BAD', 'map')).toThrow('Invalid map slug');
  });
});

describe('parseCuidParam', () => {
  it('returns a valid cuid unchanged', () => {
    expect(parseCuidParam(CUID, 'binding', 'bindingId')).toBe(CUID);
  });

  it('throws a ValidationError for a non-cuid', () => {
    expect(() => parseCuidParam('nope', 'binding', 'bindingId')).toThrow(ValidationError);
  });

  it('labels the message and keys the details on the given field', () => {
    try {
      parseCuidParam('nope', 'binding', 'bindingId');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.message).toBe('Invalid binding id');
      expect(ve.details).toMatchObject({ bindingId: ['Must be a valid id'] });
    }
  });

  it("defaults the details key to 'id' when field is omitted", () => {
    try {
      parseCuidParam('nope', 'thing');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ValidationError).details).toMatchObject({ id: ['Must be a valid id'] });
    }
  });
});

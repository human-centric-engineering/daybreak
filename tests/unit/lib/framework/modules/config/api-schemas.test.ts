/**
 * Module config API schemas (f-module-config t-2) — the `[version]` path-param parser.
 *
 * `parseVersionParam` must turn a malformed / out-of-range version segment into a clean
 * 400 (ValidationError), never let it reach the DB as an out-of-`int4` value (a 500).
 *
 * @see lib/framework/modules/config/api-schemas.ts
 */

import { describe, it, expect } from 'vitest';
import { parseVersionParam } from '@/lib/framework/modules/config/api-schemas';
import { ValidationError } from '@/lib/api/errors';

describe('parseVersionParam', () => {
  it('accepts a canonical positive integer', () => {
    expect(parseVersionParam('2')).toBe(2);
    expect(parseVersionParam('2147483647')).toBe(2147483647); // int4 max
  });

  it.each([
    ['0', 'zero (not positive)'],
    ['-1', 'negative'],
    ['1.5', 'non-integer'],
    ['2147483648', 'above int4 max → would 500 at the DB'],
    ['99999999999999999999', 'far above int4 max'],
    ['1e3', 'scientific notation'],
    ['0x10', 'hex'],
    [' 3 ', 'whitespace-padded'],
    ['abc', 'non-numeric'],
    ['', 'empty'],
  ])('rejects %j (%s) with a ValidationError', (raw) => {
    expect(() => parseVersionParam(raw)).toThrow(ValidationError);
  });
});

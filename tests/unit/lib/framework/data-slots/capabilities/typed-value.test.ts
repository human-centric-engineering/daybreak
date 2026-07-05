/**
 * Typed slot values (f-slot-capture t-3) — the dataType↔typed-value bridge. Pure.
 */

import { describe, it, expect } from 'vitest';
import {
  typedValueSchema,
  validateTypedValue,
} from '@/lib/framework/data-slots/capabilities/typed-value';

describe('typedValueSchema', () => {
  it('maps each dataType to its JSON Schema (object-rooted for json/text-string)', () => {
    expect(typedValueSchema('number')).toEqual({ type: 'number' });
    expect(typedValueSchema('boolean')).toEqual({ type: 'boolean' });
    expect(typedValueSchema('date')).toEqual({ type: 'string', format: 'date-time' });
    expect(typedValueSchema('json')).toEqual({ type: 'object' });
    expect(typedValueSchema('text')).toEqual({ type: 'string' });
    expect(typedValueSchema('unknown-kind')).toEqual({ type: 'string' }); // falls back to text
  });
});

describe('validateTypedValue', () => {
  it('accepts a matching value and returns it', () => {
    expect(validateTypedValue('number', 8)).toBe(8);
    expect(validateTypedValue('boolean', true)).toBe(true);
    expect(validateTypedValue('date', '2026-07-05T12:00:00Z')).toBe('2026-07-05T12:00:00Z');
    expect(validateTypedValue('date', '2026-07-05')).toBe('2026-07-05'); // date-only ISO is fine
    expect(validateTypedValue('json', { a: 1 })).toEqual({ a: 1 });
    expect(validateTypedValue('text', 'hello')).toBe('hello');
  });

  it('returns null for a mismatched or absent value', () => {
    expect(validateTypedValue('number', 'eight')).toBeNull();
    expect(validateTypedValue('boolean', 1)).toBeNull();
    expect(validateTypedValue('date', 'not-a-date')).toBeNull();
    expect(validateTypedValue('json', [1, 2])).toBeNull(); // array is not an object root
    expect(validateTypedValue('number', undefined)).toBeNull();
  });

  it('rejects a locale/non-ISO date that Date.parse would tolerate (lexicographic-sort safety)', () => {
    // '03/05/2026' parses but sorts wrongly against ISO strings under gte/lte gates.
    expect(validateTypedValue('date', '03/05/2026')).toBeNull();
    expect(validateTypedValue('date', 'March 5 2026')).toBeNull();
  });

  it('rejects a non-finite number', () => {
    expect(validateTypedValue('number', Infinity)).toBeNull();
  });
});

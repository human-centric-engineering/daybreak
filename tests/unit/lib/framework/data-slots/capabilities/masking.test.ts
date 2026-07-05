/**
 * Sensitivity masking-before-storage (f-slot-capture t-3, decision 6). Pure.
 * Proves standard/sensitive pass through untouched, and special_category masks the
 * prose while keeping only a non-prose typed gate value.
 */

import { describe, it, expect } from 'vitest';
import {
  slotMaskingPolicy,
  type SlotStoredForm,
} from '@/lib/framework/data-slots/capabilities/masking';

describe('slotMaskingPolicy', () => {
  it('passes a standard slot through unchanged', () => {
    const input: SlotStoredForm = {
      value: 'discloses a health condition',
      valueJson: 'discloses a health condition',
    };
    expect(slotMaskingPolicy('standard', 'text', input)).toEqual(input);
  });

  it('passes a sensitive slot through unchanged (masking is the audit-trace axis, not this one)', () => {
    const input: SlotStoredForm = { value: 'discloses a health condition', valueJson: 5 };
    expect(slotMaskingPolicy('sensitive', 'number', input)).toEqual(input);
  });

  it('special_category text: masks the value and drops the typed prose', () => {
    const out = slotMaskingPolicy('special_category', 'text', {
      value: 'discloses a health condition',
      valueJson: 'discloses a health condition',
    });
    expect(out.value).not.toContain('health');
    expect(out.valueJson).toBeNull();
  });

  it('special_category typed: masks the value but keeps the non-prose gate value', () => {
    const out = slotMaskingPolicy('special_category', 'number', {
      value: 'a score of 3',
      valueJson: 3,
    });
    expect(out.value).not.toContain('score');
    expect(out.valueJson).toBe(3);
  });

  it('special_category typed with no typed value: masks and keeps null (nothing to keep)', () => {
    const out = slotMaskingPolicy('special_category', 'number', {
      value: 'a score of 3',
      valueJson: null,
    });
    expect(out.value).not.toContain('score');
    expect(out.valueJson).toBeNull();
  });
});

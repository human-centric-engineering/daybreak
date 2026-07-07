/**
 * Unit test — apiFieldErrors (f-ops-views t-4a).
 *
 * The shared "flatten an APIClientError's field details to messages, else fall back" helper
 * used by the module-detail write tabs (config / settings / agents).
 *
 * @see components/admin/framework/module-detail/api-field-errors.ts
 */

import { describe, it, expect } from 'vitest';
import { apiFieldErrors } from '@/components/admin/framework/module-detail/api-field-errors';
import { APIClientError } from '@/lib/api/client';

describe('apiFieldErrors', () => {
  it('flattens the field-detail messages of an APIClientError', () => {
    const err = new APIClientError('bad', 'VALIDATION_ERROR', 422, {
      role: ['Must be one of: companion'],
      agentId: ['No active agent'],
    });
    expect(apiFieldErrors(err, 'fallback')).toEqual([
      'Must be one of: companion',
      'No active agent',
    ]);
  });

  it('falls back when the details carry no string messages', () => {
    const err = new APIClientError('bad', 'VALIDATION_ERROR', 422, { count: 3 });
    expect(apiFieldErrors(err, 'fallback')).toEqual(['bad']);
  });

  it('falls back to the error message when there are no details', () => {
    const err = new APIClientError('boom', 'ERR', 500);
    expect(apiFieldErrors(err, 'fallback')).toEqual(['boom']);
  });

  it('uses a plain Error message', () => {
    expect(apiFieldErrors(new Error('network down'), 'fallback')).toEqual(['network down']);
  });

  it('uses the fallback for a non-Error throw', () => {
    expect(apiFieldErrors('a string', 'fallback')).toEqual(['fallback']);
  });
});

/**
 * Shared Prisma write-error mapping (extracted at the rule of three).
 *
 * `uniqueTargetString` normalises P2002's polymorphic `meta.target`; `mapPrismaWriteError`
 * routes P2002 → the caller's `ValidationError` (via `onUnique`) and P2025 →
 * `NotFoundError`, and rethrows everything else unchanged.
 *
 * @see lib/framework/shared/prisma-errors.ts
 */

import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { uniqueTargetString, mapPrismaWriteError } from '@/lib/framework/shared/prisma-errors';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: 'test', meta });

describe('uniqueTargetString', () => {
  it('joins a string[] target', () => {
    expect(uniqueTargetString(known('P2002', { target: ['moduleId', 'eventType'] }))).toBe(
      'moduleId,eventType'
    );
  });

  it('passes a string target through', () => {
    expect(uniqueTargetString(known('P2002', { target: 'framework_x_single_primary' }))).toBe(
      'framework_x_single_primary'
    );
  });

  it('returns an empty string when target is absent', () => {
    expect(uniqueTargetString(known('P2002'))).toBe('');
  });
});

describe('mapPrismaWriteError', () => {
  it('routes P2002 to the onUnique handler with the normalised target', () => {
    let seen = '';
    expect(() =>
      mapPrismaWriteError(known('P2002', { target: ['a', 'b'] }), {
        onUnique: (target) => {
          seen = target;
          throw new ValidationError('dup');
        },
      })
    ).toThrow(ValidationError);
    expect(seen).toBe('a,b');
  });

  it('maps P2025 to a NotFoundError with the given message', () => {
    expect(() => mapPrismaWriteError(known('P2025'), { notFound: 'gone concurrently' })).toThrow(
      NotFoundError
    );
  });

  it('rethrows a P2002 unchanged when no onUnique handler is provided', () => {
    const err = known('P2002', { target: 'x' });
    expect(() => mapPrismaWriteError(err, { notFound: 'n/a' })).toThrow(err);
  });

  it('rethrows an unrelated Prisma error code unchanged', () => {
    const err = known('P2003');
    expect(() =>
      mapPrismaWriteError(err, { onUnique: () => throwValidation(), notFound: 'x' })
    ).toThrow(err);
  });

  it('rethrows a non-Prisma error unchanged', () => {
    const err = new Error('boom');
    expect(() => mapPrismaWriteError(err, { onUnique: () => throwValidation() })).toThrow(err);
  });
});

function throwValidation(): never {
  throw new ValidationError('should not reach');
}

/**
 * Shared Prisma write-error mapping for framework-tier services.
 *
 * Turns the two constraint races every binding/versioning service hits into clean
 * 4xx domain errors instead of a raw 500:
 *   - **P2002** (unique violation) → the caller's `ValidationError` (the caller owns
 *     the message, since it knows which unique index means what — e.g. a compound
 *     `(moduleId, eventType, workflowId)` "already bound" vs a partial `single_primary`
 *     "only one primary seat").
 *   - **P2025** (record not found) → `NotFoundError` — the row was deleted between a
 *     belongs-to guard and the update/delete (a concurrent unbind).
 *
 * Extracted at the rule of three (t-1's `rethrowBindingWriteError`, f-map's
 * version-service P2002 catch, then the workflow bindings) so the fiddly
 * `meta.target` normalisation lives in one place.
 */

import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/api/errors';

/**
 * Normalise a P2002 error's `meta.target` (which Prisma types as `string | string[] |
 * undefined` depending on the driver) to a single comma-joined string, so callers can
 * `.includes('single_primary')` to tell which unique index was violated.
 */
export function uniqueTargetString(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target;
  return Array.isArray(target) ? target.join(',') : typeof target === 'string' ? target : '';
}

/**
 * Map a Prisma known-request write error to a framework domain error, or rethrow it
 * unchanged. `onUnique` (given the normalised violated-index string) handles P2002 —
 * it must throw the caller's `ValidationError`. `notFound`, when set, turns P2025 into
 * a `NotFoundError` with that message. Any other error (or an unmatched code) is
 * rethrown so it surfaces as a 500.
 *
 * **Pass `onUnique` on any write that can hit a unique index.** If a write path can
 * raise P2002 but the caller omits `onUnique` (e.g. copied from a create-only site that
 * had no unique constraint), this silently rethrows → a raw 500 instead of a 4xx, with
 * no compile-time nudge. Only omit `onUnique` when the write provably cannot violate a
 * unique constraint.
 */
export function mapPrismaWriteError(
  err: unknown,
  opts: { onUnique?: (target: string) => never; notFound?: string }
): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002' && opts.onUnique) {
      opts.onUnique(uniqueTargetString(err));
    }
    if (err.code === 'P2025' && opts.notFound) {
      throw new NotFoundError(opts.notFound);
    }
  }
  throw err;
}

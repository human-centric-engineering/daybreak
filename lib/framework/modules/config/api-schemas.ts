/**
 * Request validation schemas for the module config admin API (f-module-config t-2).
 *
 * The `[slug]` / `[version]` path params and the PUT/list bodies for
 * `/api/v1/admin/framework/modules/[slug]/config` and `.../versions/**`. The config
 * *content* is validated by the module's own `configSchema` inside the version service
 * (A4) — the envelope schema here only asserts the request shape (an object of values +
 * an optional change summary), so a non-object body is a clean 400 before the service.
 */

import { z } from 'zod';
import { cuidSchema } from '@/lib/validations/common';
import { parseSlugParam } from '@/lib/framework/shared/route-params';
import { ValidationError } from '@/lib/api/errors';

/**
 * PUT /modules/[slug]/config — save operator config. `config` is an arbitrary object of
 * values validated against the module's `configSchema` in the service, not here.
 */
export const saveModuleConfigBodySchema = z.object({
  config: z.record(z.string(), z.unknown()),
  changeSummary: z.string().max(500).optional(),
});

/** GET /modules/[slug]/versions — cursor pagination (cursor = last version's id). */
export const listModuleVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: cuidSchema.optional(),
});

/** Validate a `[slug]` path param; malformed ⇒ 400, not 404. */
export function parseModuleSlug(raw: string): string {
  return parseSlugParam(raw, 'module');
}

/** Postgres `int4` max — `ModuleVersion.version` is an `Int`, so a larger value can
 *  never name a real row and would error at the DB (a 500) rather than 400 if it reached
 *  `findUnique`. */
const PG_INT4_MAX = 2_147_483_647;

/**
 * Validate a `[version]` path param (a positive integer version NUMBER). A malformed
 * value can never name a real version, so this is a 400, not a 404. Canonical digits only
 * (`z.coerce` would otherwise accept `1e3`, `0x10`, ` 3 `), and bounded to `int4` so an
 * out-of-range number is a clean 400 instead of a Postgres range error → 500.
 */
export function parseVersionParam(raw: string): number {
  const n = /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  const parsed = z.number().int().positive().max(PG_INT4_MAX).safeParse(n);
  if (!parsed.success) {
    throw new ValidationError('Invalid version number', {
      version: ['Must be a positive integer'],
    });
  }
  return parsed.data;
}

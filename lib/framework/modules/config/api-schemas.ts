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

/**
 * Validate a `[version]` path param (a positive integer version NUMBER). A malformed
 * value can never name a real version, so this is a 400, not a 404.
 */
export function parseVersionParam(raw: string): number {
  const parsed = z.coerce.number().int().positive().safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid version number', {
      version: ['Must be a positive integer'],
    });
  }
  return parsed.data;
}

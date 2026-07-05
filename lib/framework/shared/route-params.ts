/**
 * Shared admin-route path-param parsers for the framework tier.
 *
 * A malformed `[slug]` / `[id]` path segment can never name a real row, so a bad
 * value is a **400** (bad input), not a 404. These centralise the `safeParse` +
 * `ValidationError` shape that every framework admin route repeats — extracted at the
 * rule of three (f-map's `parseMapSlug`, f-module-bindings' `parseModuleSlug` /
 * `parseBindingId`, then the workflow bindings), so a fix to the slug rule or the
 * error copy lands in one place instead of drifting across leaves. Each feature keeps
 * a small named wrapper (`parseModuleSlug = parseSlugParam(raw, 'module')`) for
 * readable call sites; the parsing body lives here.
 */

import { slugSchema, cuidSchema } from '@/lib/validations/common';
import { ValidationError } from '@/lib/api/errors';

/**
 * Validate a `[slug]` path param against the shared `slugSchema`. `label` names the
 * entity for the error message (`'module'` → "Invalid module slug"). Malformed ⇒ 400.
 */
export function parseSlugParam(raw: string, label: string): string {
  const parsed = slugSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid ${label} slug`, {
      slug: ['Must be lowercase alphanumeric with hyphens'],
    });
  }
  return parsed.data;
}

/**
 * Validate a cuid `[id]` path param. `label` names the entity for the error message
 * and `field` names the offending field in the details map (defaults to `'id'`).
 * Malformed ⇒ 400, not 404.
 */
export function parseCuidParam(raw: string, label: string, field = 'id'): string {
  const parsed = cuidSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid ${label} id`, { [field]: ['Must be a valid id'] });
  }
  return parsed.data;
}

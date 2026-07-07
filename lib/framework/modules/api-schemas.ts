/**
 * Request validation schemas for the module *settings* admin API (f-ops-views t-3).
 *
 * The `[slug]` path param and the PATCH body for `/api/v1/admin/framework/modules/[slug]`
 * (the lifecycle-writes route). This is the settings envelope — module *config* (the
 * schema-validated value bag) has its own schemas under `config/api-schemas.ts`; the two
 * are deliberately separate surfaces (config is a fill-and-save form validated by the
 * module's own Zod schema; settings are the operator-controlled lifecycle columns).
 *
 * `status` / `audience` are stored free-form (X1 — no DB enum), so they're validated only
 * as bounded non-empty strings here; the code-side vocabulary lives in `status.ts`. The
 * availability window is edited as ISO-8601 strings and coerced to `Date` in the route.
 */

import { z } from 'zod';
import { parseSlugParam } from '@/lib/framework/shared/route-params';

/** Validate a `[slug]` path param; malformed ⇒ 400, not 404. */
export function parseModuleSlug(raw: string): string {
  return parseSlugParam(raw, 'module');
}

/** A trimmed, non-empty, bounded free-form label (status / audience). */
const label = z.string().trim().min(1).max(50);

/**
 * PATCH /modules/[slug] — partial update of the operator-editable lifecycle columns.
 *
 * Every field is optional (PATCH semantics: only the sent fields change). `featureFlagName`
 * and the two window bounds are additionally nullable — sending `null` explicitly *clears*
 * them (unbinds the flag / opens the window end), which a plain "optional" can't express.
 * `.strict()` rejects unknown keys (e.g. an attempt to PATCH `config`, `slug`, or
 * `isRegistered` — all owned elsewhere) as a clean 400. `.refine` rejects an empty body so
 * a no-op PATCH doesn't write an audit entry with no changes.
 *
 * Cross-field window coherence (`availableFrom <= availableUntil`) is checked in the
 * service against the *merged* row (a PATCH may set only one bound), where the current
 * values are known — it can't be expressed on this partial body alone.
 */
export const updateModuleBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    status: label,
    audience: label,
    featureFlagName: z.string().trim().min(1).max(200).nullable(),
    availableFrom: z.string().datetime().nullable(),
    availableUntil: z.string().datetime().nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateModuleBody = z.infer<typeof updateModuleBodySchema>;

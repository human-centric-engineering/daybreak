/**
 * Request validation schemas for the framework map admin API (f-map t-3).
 *
 * Zod schemas for the `/api/v1/admin/framework/maps/**` route bodies, query
 * params, and the `[slug]` path param. Framework-tier; the routes are the only
 * consumers. Bodies that carry a map reuse `mapDefinitionSchema` (t-1) so the
 * API and the version service validate against one source of truth.
 */

import { z } from 'zod';
import { slugSchema, cuidSchema } from '@/lib/validations/common';
import { parseSlugParam } from '@/lib/framework/shared/route-params';
import { mapDefinitionSchema } from '@/lib/framework/facilitation/map/schema';

/** POST /maps — create a map, optionally with an initial (v1-published) map. */
export const createMapBodySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  definition: mapDefinitionSchema.optional(),
});

/** PATCH /maps/[slug] — a draft to save, or `null` to discard the current draft. */
export const saveDraftBodySchema = z.object({
  definition: mapDefinitionSchema.nullable(),
});

/** POST /maps/[slug]/publish */
export const publishMapBodySchema = z.object({
  changeSummary: z.string().max(500).optional(),
});

/** POST /maps/[slug]/rollback — target a version by its NUMBER (slug-keyed API). */
export const rollbackMapBodySchema = z.object({
  targetVersion: z.number().int().positive(),
  changeSummary: z.string().max(500).optional(),
});

/** GET /maps/[slug]/versions — cursor pagination (cursor = last version's id). */
export const listMapVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: cuidSchema.optional(),
});

/** One synthetic slot reading in a dry-run body (F18). `value` matches the slot-condition
 *  value union; `confidence` (1–10) and `capturedAt` are optional. */
export const dryRunSlotSchema = z.object({
  slug: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]),
  confidence: z.number().int().min(1).max(10).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
});

/** POST /maps/[slug]/dry-run — simulate the in-editor `definition` against a synthetic
 *  user (`completions`, `slots`, `now`). A malformed definition fails `mapDefinitionSchema`
 *  here (400 with field errors), so the pure engine never runs on a bad map (F18). */
export const dryRunMapBodySchema = z.object({
  definition: mapDefinitionSchema,
  completions: z.array(z.string().min(1)).default([]),
  slots: z.array(dryRunSlotSchema).default([]),
  now: z.string().datetime({ offset: true }).optional(),
});

/**
 * Validate a `[slug]` path param. A malformed slug can never name a real map, so
 * this is a 400 (bad input), not a 404. Thin wrapper over the shared parser (the
 * parsing body is centralised in `lib/framework/shared/route-params.ts`).
 */
export function parseMapSlug(raw: string): string {
  return parseSlugParam(raw, 'map');
}

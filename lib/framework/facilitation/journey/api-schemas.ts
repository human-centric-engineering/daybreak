/**
 * Journey admin-route input schemas (f-ops-views t-5a).
 *
 * The Zod query schema for the explorer list + the `[journeyId]` path-param
 * parser. Mirrors `modules/api-schemas.ts`: the route validates untrusted input
 * here before it reaches a query, and a malformed `[journeyId]` is a **400** (a
 * bad id can't name a real row), routed through the shared `parseCuidParam`.
 */

import { z } from 'zod';
import { paginationQuerySchema } from '@/lib/validations/common';
import { parseCuidParam } from '@/lib/framework/shared/route-params';

/**
 * The explorer list query: pagination (`page`/`limit`, the shared caps) plus an
 * optional `graphSlug` to scope the picker to one map. No `q` search yet — the
 * subject filter is `subjectScope`'s job, not a free-text field.
 */
export const listJourneysQuerySchema = paginationQuerySchema.extend({
  graphSlug: z.string().trim().min(1).optional(),
});

export type ListJourneysQuery = z.infer<typeof listJourneysQuerySchema>;

/** Validate the `[journeyId]` path param (cuid); malformed ⇒ 400, not 404. */
export function parseJourneyId(raw: string): string {
  return parseCuidParam(raw, 'journey', 'journeyId');
}

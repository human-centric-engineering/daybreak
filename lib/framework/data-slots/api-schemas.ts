/**
 * Data-slots admin-route input schemas (f-admin-surfaces t-1).
 *
 * The Zod query schema for the slot-values read endpoint. Mirrors
 * `journey/api-schemas.ts`: the route validates untrusted query input here before it
 * reaches a Prisma `where`. Both filters are lenient `min(1)` strings, not strict
 * slug/cuid — an open-minted `slotSlug` need not be a canonical slug, and a filter
 * that names nothing simply returns an empty page (it is not a client error).
 */

import { z } from 'zod';
import { paginationQuerySchema, queryBooleanSchema } from '@/lib/validations/common';

/**
 * The values-browser query: pagination (`page`/`limit`, the shared caps) + optional
 * `slotSlug` / `userId` filters + `reveal`. `reveal=true` returns the stored form of
 * `sensitive` / `special_category` values instead of the default masked sentinel — an
 * audited operator action the route logs before responding. `queryBooleanSchema` (not
 * `z.coerce.boolean()`) so the string `"false"` is honoured as `false`.
 */
export const listSlotValuesQuerySchema = paginationQuerySchema.extend({
  slotSlug: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  reveal: queryBooleanSchema.optional().default(false),
});

export type ListSlotValuesQuery = z.infer<typeof listSlotValuesQuerySchema>;

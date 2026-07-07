/**
 * Request validation schemas for the framework conversation-eval admin API (f-eval t-1).
 * Framework-tier; the `/api/v1/admin/framework/facilitation/evaluations` route is the only consumer.
 */

import { z } from 'zod';
import { cuidSchema } from '@/lib/validations/common';
import { ValidationError } from '@/lib/api/errors';

/** POST /evaluations — score a framework conversation on-demand. */
export const scoreConversationBodySchema = z.object({
  conversationId: cuidSchema,
});

/** Validate the `?conversationId=` query param on GET /evaluations (a cuid); malformed ⇒ 400. */
export function parseConversationIdParam(raw: string | null): string {
  const parsed = cuidSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('A valid conversationId query parameter is required', {
      conversationId: ['Required — must be a cuid'],
    });
  }
  return parsed.data;
}

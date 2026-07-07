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

/**
 * POST /evaluations/supervise — run the post-hoc supervisor over a framework conversation (f-eval
 * t-2). `modelOverride` forces a particular judge model; otherwise the configured judge model is used.
 */
export const superviseConversationBodySchema = z.object({
  conversationId: cuidSchema,
  modelOverride: z.string().min(1).max(200).optional(),
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

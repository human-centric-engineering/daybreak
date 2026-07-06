/**
 * Request validation schemas for the module knowledge-scope admin API
 * (f-module-bindings t-4).
 *
 * A grant targets exactly one of a document or a tag. The `[slug]` parser reuses the
 * shared framework route-param helper; the target ids are validated as cuids.
 */

import { z } from 'zod';
import { cuidSchema } from '@/lib/validations/common';
import { parseSlugParam } from '@/lib/framework/shared/route-params';

/**
 * POST /modules/[slug]/knowledge — grant a document OR a tag to the module's scope.
 * Exactly one of `documentId` / `tagId` must be present.
 */
export const grantModuleKnowledgeBodySchema = z
  .object({
    documentId: cuidSchema.optional(),
    tagId: cuidSchema.optional(),
  })
  .refine((b) => (b.documentId === undefined) !== (b.tagId === undefined), {
    message: 'Provide exactly one of documentId or tagId',
  });

/**
 * DELETE /modules/[slug]/knowledge?documentId=… | ?tagId=… — revoke a document or tag.
 * Exactly one target, mirroring the grant body.
 */
export const revokeModuleKnowledgeQuerySchema = z
  .object({
    documentId: cuidSchema.optional(),
    tagId: cuidSchema.optional(),
  })
  .refine((q) => (q.documentId === undefined) !== (q.tagId === undefined), {
    message: 'Provide exactly one of documentId or tagId',
  });

/** Validate a `[slug]` path param; malformed ⇒ 400, not 404. */
export function parseModuleSlug(raw: string): string {
  return parseSlugParam(raw, 'module');
}

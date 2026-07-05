/**
 * Request validation schemas for the module agent-binding admin API
 * (f-module-bindings t-1).
 *
 * Zod schemas for the `/api/v1/admin/framework/modules/[slug]/agents/**` route
 * bodies and path params. Framework-tier; the routes are the only consumers.
 * `role` is validated for *shape* here (non-empty string) and for *membership* in
 * the module's declared `agentRoles` in the service (`bindings/service.ts`) — the
 * seat vocabulary is code, not something the API layer can know.
 */

import { z } from 'zod';
import { cuidSchema } from '@/lib/validations/common';
import { parseSlugParam, parseCuidParam } from '@/lib/framework/shared/route-params';

/** Per-binding config override — an opaque JSON object (tone hints, etc.). */
const bindingConfigSchema = z.record(z.string(), z.unknown());

/** POST /modules/[slug]/agents — bind an agent into a seat. */
export const bindAgentBodySchema = z.object({
  agentId: cuidSchema,
  role: z.string().min(1).max(100),
  isPrimary: z.boolean().optional(),
  config: bindingConfigSchema.optional(),
});

/**
 * PATCH /modules/[slug]/agents/[bindingId] — update a binding's lead-seat flag
 * and/or its config. Changing the *seat* (`role`) is an unbind + rebind, not a
 * patch. At least one mutable field must be present. `config: null` clears it.
 */
export const updateBindingBodySchema = z
  .object({
    isPrimary: z.boolean().optional(),
    config: bindingConfigSchema.nullable().optional(),
  })
  .refine((b) => b.isPrimary !== undefined || b.config !== undefined, {
    message: 'Provide at least one of isPrimary or config',
  });

/**
 * Validate a `[slug]` path param. A malformed slug can never name a real module,
 * so this is a 400 (bad input), not a 404. Thin wrapper over the shared parser.
 */
export function parseModuleSlug(raw: string): string {
  return parseSlugParam(raw, 'module');
}

/** Validate a `[bindingId]` path param (a cuid); malformed ⇒ 400, not 404. */
export function parseBindingId(raw: string): string {
  return parseCuidParam(raw, 'binding', 'bindingId');
}

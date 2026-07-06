/**
 * Request validation schemas for the facilitation agent-binding admin API
 * (f-facilitation-agents t-1).
 *
 * Zod schemas for the `/api/v1/admin/framework/facilitation/agents/**` route bodies and path
 * params. Framework-tier; the routes are the only consumers. `role` is validated for *shape*
 * here (non-empty string) and for *membership* in `FACILITATION_ROLES` in the service — the
 * seat vocabulary is a framework constant the API layer needn't duplicate.
 */

import { z } from 'zod';
import { cuidSchema } from '@/lib/validations/common';
import { parseCuidParam } from '@/lib/framework/shared/route-params';

/** Per-binding config override — an opaque JSON object (tone hints, etc.). */
const bindingConfigSchema = z.record(z.string(), z.unknown());

/** POST /facilitation/agents — bind an agent into a facilitation seat. */
export const bindFacilitationAgentBodySchema = z.object({
  agentId: cuidSchema,
  role: z.string().min(1).max(100),
  config: bindingConfigSchema.optional(),
});

/**
 * PATCH /facilitation/agents/[bindingId] — update a binding's config. Reassigning the *seat*
 * (`role`) is an unbind + rebind, not a patch, so `config` is the only mutable field;
 * `config: null` clears it.
 */
export const updateFacilitationBindingBodySchema = z.object({
  config: bindingConfigSchema.nullable(),
});

/** Validate a `[bindingId]` path param (a cuid); malformed ⇒ 400, not 404. */
export function parseFacilitationBindingId(raw: string): string {
  return parseCuidParam(raw, 'binding', 'bindingId');
}

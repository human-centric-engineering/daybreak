/**
 * Request validation schemas for the module workflow-binding admin API
 * (f-module-bindings t-3).
 *
 * Zod schemas for the `/api/v1/admin/framework/modules/[slug]/workflows/**` route
 * bodies and path params. Framework-tier; the routes are the only consumers.
 *
 * `eventType` is validated for *shape* only (a non-empty string) — it is NOT checked
 * against a declared vocabulary here. Unlike an agent `role` (checked against the
 * module's `agentRoles`), the module-lifecycle event vocabulary (`ModuleDefinition.events`)
 * belongs to **f-engagement** (08), which owns the event source; until then `eventType`
 * is free-form (X1). The `[slug]` / `[bindingId]` parsers reuse the shared framework
 * route-param helpers.
 */

import { z } from 'zod';
import { cuidSchema } from '@/lib/validations/common';
import { parseSlugParam, parseCuidParam } from '@/lib/framework/shared/route-params';

/** Operator's static input for the run — an opaque JSON object merged under the event envelope. */
const inputTemplateSchema = z.record(z.string(), z.unknown());

/** POST /modules/[slug]/workflows — bind an event to a workflow. */
export const bindWorkflowBodySchema = z.object({
  workflowId: cuidSchema,
  eventType: z.string().min(1).max(100),
  inputTemplate: inputTemplateSchema.optional(),
  enabled: z.boolean().optional(),
});

/**
 * PATCH /modules/[slug]/workflows/[bindingId] — toggle `enabled` and/or replace the
 * `inputTemplate`. Changing the *event* or *workflow* is an unbind + rebind, not a
 * patch. At least one mutable field must be present. `inputTemplate: null` clears it.
 */
export const updateWorkflowBindingBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    inputTemplate: inputTemplateSchema.nullable().optional(),
  })
  .refine((b) => b.enabled !== undefined || b.inputTemplate !== undefined, {
    message: 'Provide at least one of enabled or inputTemplate',
  });

/** Validate a `[slug]` path param; malformed ⇒ 400, not 404. */
export function parseModuleSlug(raw: string): string {
  return parseSlugParam(raw, 'module');
}

/** Validate a `[bindingId]` path param (a cuid); malformed ⇒ 400, not 404. */
export function parseWorkflowBindingId(raw: string): string {
  return parseCuidParam(raw, 'binding', 'bindingId');
}

/**
 * Request validation schemas for the facilitation policy admin API (f-policies t-1).
 *
 * Zod schemas for the `/api/v1/admin/framework/facilitation/policies/**` route bodies and path
 * params. These validate the OUTER shape only — the `(kind, payload)` integrity (a payload that
 * matches its kind) is validated in the service via `assertValidFacilitationPolicy`, the single
 * home of the discriminated union, so a bad payload is a service-level `ValidationError` (→ 400)
 * regardless of entry point. `kind` is validated for membership there too.
 */

import { z } from 'zod';
import { parseCuidParam } from '@/lib/framework/shared/route-params';

/** POST /facilitation/policies — create a policy. `payload` is checked against `kind` in the service. */
export const createFacilitationPolicyBodySchema = z.object({
  kind: z.string().min(1).max(100),
  payload: z.unknown(),
  enabled: z.boolean().optional(),
});

/**
 * PATCH /facilitation/policies/[policyId] — update `payload` and/or `enabled`. `kind` is immutable
 * (change = delete + create). At least one field must be present; a supplied `payload` is
 * re-validated against the existing kind in the service.
 */
export const updateFacilitationPolicyBodySchema = z
  .object({
    payload: z.unknown().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.payload !== undefined || v.enabled !== undefined, {
    message: 'Provide payload and/or enabled to update',
  });

/** Validate a `[policyId]` path param (a cuid); malformed ⇒ 400, not 404. */
export function parseFacilitationPolicyId(raw: string): string {
  return parseCuidParam(raw, 'policy', 'policyId');
}

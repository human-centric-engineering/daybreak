/**
 * Facilitation policy kinds (f-policies t-1) — the typed governance-policy vocabulary (spec §5.5,
 * F14). Each kind is a small typed policy with its own Zod-validated payload, under ONE table
 * (`framework_facilitation_policy`) — never a generic rules blob. The kinds are a fixed framework
 * vocabulary (like `FACILITATION_ROLES`); the payload is validated by a `z.discriminatedUnion`
 * over `kind`, mirroring the same-tier `conditionSchema` in `facilitation/map/schema.ts`.
 *
 * t-1 ships `auto_approval`. `relevance_gating` (t-2), `guard_minimum` (t-3), and `escalation`
 * (t-4) each add a member to the union (and a value to the migration's `kind` CHECK) as they land.
 * Forward note: if a kind's payload ever becomes itself a discriminated union, Zod cannot nest it
 * in the outer union — split to a per-kind schema registry then (see the f-policies plan).
 */

import { z } from 'zod';
import { ValidationError } from '@/lib/api/errors';
import { isFacilitationRole } from '@/lib/framework/facilitation/agents/roles';

/**
 * The declared policy kinds — the single vocabulary that MUST stay in lockstep across three
 * places when a kind is added: (1) this const, (2) a member of `facilitationPolicySchema` below,
 * and (3) the migration's `kind` CHECK `IN (…)` list. A `kinds.test.ts` guard asserts (1) ⇔ (2)
 * so the const can't go stale; (3) is a migration the author writes (a union member the CHECK
 * lacks would let Zod pass a write the DB then rejects — so extend the CHECK in the same task).
 */
export const FACILITATION_POLICY_KINDS = ['auto_approval', 'relevance_gating'] as const;
export type FacilitationPolicyKind = (typeof FACILITATION_POLICY_KINDS)[number];

/**
 * Auto-approval risk knob (§9.2) — which structure-change proposals may bypass human sign-off.
 * Ships `none` (every proposal needs approval). `low_risk` is structurally allowed for
 * forward-compat but has NO runtime effect until `f-emergence` (18) builds the proposal pipeline
 * that reads it (no `StructureChangeProposal` exists yet). The risk *taxonomy* — which change
 * classes are safe to auto-approve — is deferred (§9.2, empirical).
 */
export const autoApprovalPayloadSchema = z
  .object({
    autoApprove: z.enum(['none', 'low_risk']),
  })
  .strict();

const autoApprovalPolicySchema = z.object({
  kind: z.literal('auto_approval'),
  payload: autoApprovalPayloadSchema,
});

/** A declared facilitation seat (validated against `FACILITATION_ROLES`) — a typo can't silently
 *  narrow a gate's allow-list. */
const facilitationRoleSchema = z
  .string()
  .refine(isFacilitationRole, { message: 'Not a facilitation role' });

/**
 * Relevance/maturity gating (spec §5.5, F14 · f-policies t-2) — "stage/region → allowed roles".
 * A policy is GRAPH-SCOPED (`graphSlug`): it gates which facilitation roles a user may reach on
 * that map given where they are in it. `match` selects a position (an empty `match` = the whole
 * graph); `allowedRoles` is the roles permitted when the policy applies. Enforced at
 * `resolveFacilitationSurface` — a role not in an applicable policy's `allowedRoles` yields no
 * surface (→ 404). Fail-open: with no applicable policy, all roles are allowed.
 */
export const relevanceGatingPayloadSchema = z
  .object({
    graphSlug: z.string().min(1),
    match: z
      .object({
        stage: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
      })
      .strict()
      .default({}),
    allowedRoles: z.array(facilitationRoleSchema).min(1),
  })
  .strict();

export type RelevanceGatingPayload = z.infer<typeof relevanceGatingPayloadSchema>;

const relevanceGatingPolicySchema = z.object({
  kind: z.literal('relevance_gating'),
  payload: relevanceGatingPayloadSchema,
});

/**
 * The discriminated union over every policy kind — validates that `payload` matches `kind`, and
 * rejects unknown kinds (the forward-compat guard). Each kind adds a member here (and a value to
 * the migration's `kind` CHECK + `FACILITATION_POLICY_KINDS`, kept in lockstep by the drift guard).
 */
export const facilitationPolicySchema = z.discriminatedUnion('kind', [
  autoApprovalPolicySchema,
  relevanceGatingPolicySchema,
]);

export type FacilitationPolicyInput = z.infer<typeof facilitationPolicySchema>;

/**
 * Validate a `(kind, payload)` pair against its kind's schema, or throw a `ValidationError`
 * (→ 400). An unknown `kind`, or a payload that doesn't match the kind, both raise here — so the
 * kind↔payload integrity lives in one place the service and any future caller share.
 */
export function assertValidFacilitationPolicy(
  kind: string,
  payload: unknown
): FacilitationPolicyInput {
  const result = facilitationPolicySchema.safeParse({ kind, payload });
  if (!result.success) {
    // Mirror the canonical `validateRequestBody` shape (`{ errors: [{ path, message }] }`).
    throw new ValidationError(`Invalid facilitation policy of kind "${kind}"`, {
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

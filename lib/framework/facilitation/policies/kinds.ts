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
export const FACILITATION_POLICY_KINDS = [
  'auto_approval',
  'relevance_gating',
  'guard_minimum',
  'escalation',
] as const;
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
 * Guard-minimums per scope (spec §5.5, F16 · f-policies t-3) — a scope can MANDATE an inline guard
 * floor (raise a guard to at least `warn_and_continue`/`block`). Ships scoped to a facilitation
 * `role` (the v1 unit; a `module` scope is an additive future value). `minimums` names a floor for
 * any of the three inline guards; at least one is required. Enforced via the generic core
 * guard-floor seam (`registerGuardFloorContributor`) — a floor only ever RAISES a guard.
 */
const guardFloorModeSchema = z.enum(['log_only', 'warn_and_continue', 'block']);

export const guardMinimumPayloadSchema = z
  .object({
    scope: z
      .object({
        type: z.literal('facilitation_role'),
        id: facilitationRoleSchema,
      })
      .strict(),
    minimums: z
      .object({
        input: guardFloorModeSchema.optional(),
        output: guardFloorModeSchema.optional(),
        citation: guardFloorModeSchema.optional(),
      })
      .strict()
      .refine((m) => m.input !== undefined || m.output !== undefined || m.citation !== undefined, {
        message: 'Provide at least one guard minimum (input/output/citation)',
      }),
  })
  .strict();

export type GuardMinimumPayload = z.infer<typeof guardMinimumPayloadSchema>;

const guardMinimumPolicySchema = z.object({
  kind: z.literal('guard_minimum'),
  payload: guardMinimumPayloadSchema,
});

/**
 * Escalation pathway (spec §5.5, F15 · f-emergence t-1, picked up from f-policies' deferred t-4) —
 * "when signal S is detected in scope X, do Y". When an inline guard fires on a facilitation role's
 * surface at or above the configured severity, escalate: notify a human reviewer (via the shipped
 * escalation-notifier) and always log — turning a silent guard block into a defined, auditable
 * pathway. Enforced via the post-detection guard-event core seam (`registerGuardEventContributor`).
 * `signal.outcome` is the MINIMUM severity to fire on (`flagged` = any detection; `blocked` = only a
 * hard block). v1 response is notify + log; conversation-rerouting (a workflow) and user-facing
 * resources are a documented follow-up.
 */
export const escalationPayloadSchema = z
  .object({
    scope: z
      .object({
        type: z.literal('facilitation_role'),
        id: facilitationRoleSchema,
      })
      .strict(),
    signal: z
      .object({
        guard: z.enum(['input', 'output', 'citation']),
        outcome: z.enum(['flagged', 'blocked']),
      })
      .strict(),
    priority: z.enum(['low', 'medium', 'high']),
  })
  .strict();

export type EscalationPayload = z.infer<typeof escalationPayloadSchema>;

const escalationPolicySchema = z.object({
  kind: z.literal('escalation'),
  payload: escalationPayloadSchema,
});

/**
 * The discriminated union over every policy kind — validates that `payload` matches `kind`, and
 * rejects unknown kinds (the forward-compat guard). Each kind adds a member here (and a value to
 * the migration's `kind` CHECK + `FACILITATION_POLICY_KINDS`, kept in lockstep by the drift guard).
 */
export const facilitationPolicySchema = z.discriminatedUnion('kind', [
  autoApprovalPolicySchema,
  relevanceGatingPolicySchema,
  guardMinimumPolicySchema,
  escalationPolicySchema,
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

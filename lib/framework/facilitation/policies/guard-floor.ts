/**
 * Facilitation guard-floor contributor (f-policies t-3, spec §5.5 F16) — the framework half of the
 * generic core guard-floor seam. A `guard_minimum` policy scoped to a facilitation role MANDATES a
 * minimum inline-guard mode for that role's chat surface: in a safety-critical scope, inline
 * vetting (`block`) before the user sees a turn must be non-negotiable, and the latency cost is
 * accepted.
 *
 * Registered into the core `registerGuardFloorContributor` seam at `initFramework`. Only turns on a
 * facilitation surface (`contextType`) are floored — everything else gets `{}` (no floor), so the
 * seam is inert for ordinary chat. A floor only ever RAISES a guard (the core applies the strictest
 * of the agent/global mode and this floor); it never lowers one.
 */

import type {
  GuardFloorRequest,
  GuardFloors,
  GuardMode,
  GuardKind,
} from '@/lib/orchestration/chat/guard-floor';
import { FACILITATION_SURFACE_CONTEXT_TYPE } from '@/lib/framework/facilitation/agents/surface';
import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { guardMinimumPayloadSchema } from '@/lib/framework/facilitation/policies/kinds';
import { logger } from '@/lib/logging';

/** The registration key for the core guard-floor seam (idempotent per key). */
export const FACILITATION_GUARD_FLOOR_KEY = 'facilitation-guard-minimums';

const RANK: Record<GuardMode, number> = { none: 0, log_only: 1, warn_and_continue: 2, block: 3 };
const GUARD_KINDS: readonly GuardKind[] = ['input', 'output', 'citation'];

/**
 * Resolve the guard floor for a facilitation-surface turn from the enabled `guard_minimum`
 * policies scoped to the turn's role (`contextId`). Returns the strictest minimum per guard across
 * matching policies, or `{}` when the turn isn't a facilitation surface or no policy applies.
 */
export async function resolveFacilitationGuardFloor(ctx: GuardFloorRequest): Promise<GuardFloors> {
  if (ctx.contextType !== FACILITATION_SURFACE_CONTEXT_TYPE || !ctx.contextId) return {};

  const policies = await listEnabledFacilitationPolicies('guard_minimum');
  if (policies.length === 0) return {};

  const floor: GuardFloors = {};
  for (const policy of policies) {
    const parsed = guardMinimumPayloadSchema.safeParse(policy.payload);
    if (!parsed.success) {
      logger.warn('Skipping malformed guard_minimum policy', { policyId: policy.id });
      continue;
    }
    const { scope, minimums } = parsed.data;
    if (scope.type !== 'facilitation_role' || scope.id !== ctx.contextId) continue;

    for (const kind of GUARD_KINDS) {
      const mode = minimums[kind];
      const current = floor[kind];
      if (mode !== undefined && (current === undefined || RANK[mode] > RANK[current])) {
        floor[kind] = mode;
      }
    }
  }
  return floor;
}

/**
 * Facilitation escalation contributor (f-emergence t-1, spec §5.5 F15 — picked up from f-policies'
 * deferred t-4). The framework half of the generic post-detection guard-event core seam: when an
 * inline guard fires on a facilitation role's surface, an `escalation` policy scoped to that role
 * turns the detection into a **defined, auditable pathway** — notify a human reviewer (via the
 * shipped escalation-notifier) and always log to the audit trail. This is the difference between a
 * silent guard block and a configured incident response (F15).
 *
 * Registered into the core `registerGuardEventContributor` seam at `initFramework`, and invoked
 * fire-and-forget (a guard-event handler never delays or breaks a turn). Only facilitation-surface
 * turns are considered; everything else returns immediately. v1 response = notify + log;
 * conversation-rerouting (a workflow via `drainEngine`) + user-facing resources are a follow-up.
 */

import type { GuardEvent, GuardEventContext } from '@/lib/orchestration/chat/guard-events';
import { FACILITATION_SURFACE_CONTEXT_TYPE } from '@/lib/framework/facilitation/agents/surface';
import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import {
  escalationPayloadSchema,
  type EscalationPayload,
} from '@/lib/framework/facilitation/policies/kinds';
import { notifyEscalation } from '@/lib/orchestration/capabilities/built-in/escalation-notifier';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { logger } from '@/lib/logging';

/** The registration key for the core guard-event seam (idempotent per key). */
export const FACILITATION_ESCALATION_KEY = 'facilitation-escalation';

/** Outcome severity — a `blocked` guard is stricter than a mere `flagged` detection. */
const OUTCOME_SEVERITY: Record<GuardEvent['outcome'], number> = { flagged: 1, blocked: 2 };

/** Whether an observed outcome meets a policy's MINIMUM-severity `signal.outcome`. */
function outcomeMeetsMinimum(
  policyMinimum: EscalationPayload['signal']['outcome'],
  observed: GuardEvent['outcome']
): boolean {
  return OUTCOME_SEVERITY[observed] >= OUTCOME_SEVERITY[policyMinimum];
}

/**
 * Handle a guard firing on a facilitation surface: for each enabled `escalation` policy scoped to
 * the turn's role whose `signal` matches this guard at (or above) its minimum severity, dispatch the
 * escalation (notify + log). No-op for non-facilitation turns or when no policy matches.
 */
export async function handleFacilitationGuardEvent(
  ctx: GuardEventContext,
  event: GuardEvent
): Promise<void> {
  if (ctx.contextType !== FACILITATION_SURFACE_CONTEXT_TYPE || !ctx.contextId) return;

  const policies = await listEnabledFacilitationPolicies('escalation');
  if (policies.length === 0) return;

  for (const policy of policies) {
    const parsed = escalationPayloadSchema.safeParse(policy.payload);
    if (!parsed.success) {
      logger.warn('Skipping malformed escalation policy', { policyId: policy.id });
      continue;
    }
    const { scope, signal, priority } = parsed.data;
    if (scope.type !== 'facilitation_role' || scope.id !== ctx.contextId) continue;
    if (signal.guard !== event.guard) continue;
    if (!outcomeMeetsMinimum(signal.outcome, event.outcome)) continue;

    await dispatchEscalation(ctx, event, priority);
  }
}

async function dispatchEscalation(
  ctx: GuardEventContext,
  event: GuardEvent,
  priority: EscalationPayload['priority']
): Promise<void> {
  const reason = `Facilitation guard '${event.guard}' ${event.outcome} on role '${ctx.contextId}'`;

  // Notify a human reviewer — email/webhook per the global escalationConfig, which applies its own
  // priority threshold. Never throws.
  await notifyEscalation({
    agentId: ctx.agentId,
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    reason,
    priority,
    metadata: {
      source: 'facilitation_escalation',
      guard: event.guard,
      outcome: event.outcome,
      role: ctx.contextId ?? null,
    },
  });

  // Always log. The actor is the system (a guard fired), not an admin, so `userId` is null; the
  // affected user is recorded in metadata.
  logAdminAction({
    userId: null,
    action: 'facilitation_escalation.triggered',
    entityType: 'facilitation_escalation',
    entityId: ctx.conversationId,
    entityName: ctx.contextId,
    metadata: {
      guard: event.guard,
      outcome: event.outcome,
      role: ctx.contextId,
      priority,
      affectedUserId: ctx.userId,
    },
    clientIp: null,
  });
}

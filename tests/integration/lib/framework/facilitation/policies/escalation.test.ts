/**
 * Facilitation escalation contributor (f-emergence t-1, F15). Mocks the enabled-policy query + the
 * shipped notify/audit machinery; keeps the real escalationPayloadSchema. Proves it fires only on
 * facilitation surfaces, matches role + guard + minimum-severity, notifies + logs, and skips
 * non-matching / malformed policies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/facilitation/policies/policy-queries', () => ({
  listEnabledFacilitationPolicies: vi.fn(),
}));
vi.mock('@/lib/orchestration/capabilities/built-in/escalation-notifier', () => ({
  notifyEscalation: vi.fn(),
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

import { handleFacilitationGuardEvent } from '@/lib/framework/facilitation/policies/escalation';
import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { notifyEscalation } from '@/lib/orchestration/capabilities/built-in/escalation-notifier';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { FACILITATION_SURFACE_CONTEXT_TYPE } from '@/lib/framework/facilitation/agents/surface';
import type { GuardEvent, GuardEventContext } from '@/lib/orchestration/chat/guard-events';

const ctx = (over: Partial<GuardEventContext> = {}): GuardEventContext => ({
  contextType: FACILITATION_SURFACE_CONTEXT_TYPE,
  contextId: 'onboarding',
  agentId: 'a1',
  userId: 'u1',
  conversationId: 'c1',
  ...over,
});
const event = (over: Partial<GuardEvent> = {}): GuardEvent => ({
  guard: 'output',
  outcome: 'block',
  ...over,
});
const policy = (payload: unknown) => ({ id: 'fp-1', kind: 'escalation', payload });
const escPayload = (over: Record<string, unknown> = {}) => ({
  scope: { type: 'facilitation_role', id: 'onboarding' },
  signal: { guard: 'output', outcome: 'flagged' },
  priority: 'high',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('handleFacilitationGuardEvent', () => {
  it('is inert for a non-facilitation surface (no policy query)', async () => {
    await handleFacilitationGuardEvent(ctx({ contextType: 'module' }), event());
    expect(listEnabledFacilitationPolicies).not.toHaveBeenCalled();
    expect(notifyEscalation).not.toHaveBeenCalled();
  });

  it('returns without notifying when there are no escalation policies', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([]);
    await handleFacilitationGuardEvent(ctx(), event());
    expect(notifyEscalation).not.toHaveBeenCalled();
  });

  it('notifies + logs when a policy matches the role, guard and severity', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([policy(escPayload())] as never);
    await handleFacilitationGuardEvent(ctx(), event({ outcome: 'block' }));
    expect(notifyEscalation).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'a1',
        userId: 'u1',
        conversationId: 'c1',
        priority: 'high',
        metadata: expect.objectContaining({
          guard: 'output',
          outcome: 'block',
          role: 'onboarding',
        }),
      })
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'facilitation_escalation.triggered', userId: null })
    );
  });

  it('ignores a policy scoped to a different role', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      policy(escPayload({ scope: { type: 'facilitation_role', id: 'state' } })),
    ] as never);
    await handleFacilitationGuardEvent(ctx(), event());
    expect(notifyEscalation).not.toHaveBeenCalled();
  });

  it('ignores a policy for a different guard', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      policy(escPayload({ signal: { guard: 'input', outcome: 'flagged' } })),
    ] as never);
    await handleFacilitationGuardEvent(ctx(), event({ guard: 'output' }));
    expect(notifyEscalation).not.toHaveBeenCalled();
  });

  it('does not fire when the observed outcome is below the policy minimum (blocked-only vs flagged)', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      policy(escPayload({ signal: { guard: 'output', outcome: 'blocked' } })),
    ] as never);
    await handleFacilitationGuardEvent(ctx(), event({ outcome: 'warn_and_continue' }));
    expect(notifyEscalation).not.toHaveBeenCalled();
  });

  it('fires when the observed outcome exceeds the policy minimum (flagged-min vs blocked)', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      policy(escPayload({ signal: { guard: 'output', outcome: 'flagged' } })),
    ] as never);
    await handleFacilitationGuardEvent(ctx(), event({ outcome: 'block' }));
    expect(notifyEscalation).toHaveBeenCalledOnce();
  });

  it('skips a malformed escalation policy', async () => {
    vi.mocked(listEnabledFacilitationPolicies).mockResolvedValue([
      policy({ scope: { type: 'facilitation_role', id: 'onboarding' } }), // missing signal/priority
    ] as never);
    await handleFacilitationGuardEvent(ctx(), event());
    expect(notifyEscalation).not.toHaveBeenCalled();
  });
});

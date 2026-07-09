/**
 * Proactive-guidance workflow step (f-overlays t-3b). Mocks the executor registry + the delivery
 * service. Proves the step type registers, the executor runs delivery and returns a StepResult, and an
 * invalid config throws ExecutorError.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/orchestration/engine/executor-registry', () => ({ registerStepType: vi.fn() }));
vi.mock('@/lib/framework/facilitation/overlays/nudge', () => ({ deliverProactiveNudges: vi.fn() }));

import {
  registerProactiveGuidanceStep,
  PROACTIVE_GUIDANCE_STEP_TYPE,
} from '@/lib/framework/facilitation/overlays/proactive-step';
import { registerStepType } from '@/lib/orchestration/engine/executor-registry';
import { deliverProactiveNudges } from '@/lib/framework/facilitation/overlays/nudge';
import { ExecutorError } from '@/lib/orchestration/engine/errors';
import type { StepExecutor } from '@/lib/orchestration/engine/executor-registry';

const ctx = {} as never;
const step = (config: unknown) =>
  ({ id: 's1', type: PROACTIVE_GUIDANCE_STEP_TYPE, config }) as never;

/** Register, then hand back the executor the module registered (for direct invocation). */
function getExecutor(): StepExecutor {
  registerProactiveGuidanceStep();
  const call = vi.mocked(registerStepType).mock.calls[0];
  return call[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deliverProactiveNudges).mockResolvedValue({
    scanned: 3,
    candidates: 2,
    throttled: 0,
    emailsSent: 2,
    webhooksSent: 0,
    webhookFailed: 0,
    journeysNudged: 2,
    noEmail: 0,
    failed: 0,
  });
});

describe('registerProactiveGuidanceStep', () => {
  it('registers the framework_proactive_guidance step type', () => {
    registerProactiveGuidanceStep();
    expect(registerStepType).toHaveBeenCalledWith(
      'framework_proactive_guidance',
      expect.any(Function)
    );
  });
});

describe('the proactive-guidance step executor', () => {
  it('runs delivery with the step config and returns the summary as a StepResult', async () => {
    const executor = getExecutor();
    const result = await executor(step({ stalledDays: 14, maxJourneys: 50 }), ctx);
    expect(deliverProactiveNudges).toHaveBeenCalledWith({ stalledDays: 14, maxJourneys: 50 });
    expect(result).toEqual({
      output: {
        scanned: 3,
        candidates: 2,
        throttled: 0,
        emailsSent: 2,
        webhooksSent: 0,
        webhookFailed: 0,
        journeysNudged: 2,
        noEmail: 0,
        failed: 0,
      },
      tokensUsed: 0,
      costUsd: 0,
    });
  });

  it('runs with defaults when config is absent', async () => {
    const executor = getExecutor();
    await executor(step(undefined), ctx);
    expect(deliverProactiveNudges).toHaveBeenCalledWith({});
  });

  it('throws ExecutorError on an invalid config (and does not run delivery)', async () => {
    const executor = getExecutor();
    await expect(executor(step({ stalledDays: -5 }), ctx)).rejects.toBeInstanceOf(ExecutorError);
    expect(deliverProactiveNudges).not.toHaveBeenCalled();
  });
});

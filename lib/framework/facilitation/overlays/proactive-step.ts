/**
 * Proactive-guidance workflow step (f-overlays t-3b, spec §5.4, F13) — the scheduling seam.
 *
 * There is no framework periodic-task hook (the maintenance tick is Sunrise-owned + hard-coded), so
 * the fork-lawful way to run proactive guidance on a schedule is a custom workflow STEP TYPE (the same
 * `registerStepType` seam `send_notification` uses): an operator authors a one-step workflow of type
 * `framework_proactive_guidance` and points an `AiWorkflowSchedule` cron at it. The step runs the
 * throttled nudge delivery. Daybreak ships the step type but seeds NO workflow/schedule row — a fresh
 * fork boots clean; the operator wires it when they want it.
 *
 * Registered from `initFramework()` (server boot), not the core executor barrel, so it never affects
 * the core BE↔FE step-registry parity. The throttle table provides idempotency, so — unlike
 * `send_notification` — this needs no dispatch-cache: a re-driven step simply re-sweeps and re-throttles.
 */

import { z } from 'zod';
import type { StepResult, WorkflowStep } from '@/types/orchestration';
import type { ExecutionContext } from '@/lib/orchestration/engine/context';
import { registerStepType } from '@/lib/orchestration/engine/executor-registry';
import { ExecutorError } from '@/lib/orchestration/engine/errors';
import { deliverProactiveNudges } from '@/lib/framework/facilitation/overlays/nudge';

/** The workflow step type an operator schedules to run proactive guidance. */
export const PROACTIVE_GUIDANCE_STEP_TYPE = 'framework_proactive_guidance';

/** Optional per-step overrides of the sweep/throttle defaults. */
const configSchema = z
  .object({
    stalledDays: z.number().int().min(1).max(365).optional(),
    maxJourneys: z.number().int().min(1).max(1000).optional(),
    throttleDays: z.number().int().min(1).max(365).optional(),
  })
  .optional();

async function executeProactiveGuidance(
  step: WorkflowStep,
  _ctx: Readonly<ExecutionContext>
): Promise<StepResult> {
  const parsed = configSchema.safeParse(step.config);
  if (!parsed.success) {
    throw new ExecutorError(
      step.id,
      'INVALID_CONFIG',
      `Invalid framework_proactive_guidance config: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }

  const summary = await deliverProactiveNudges(parsed.data ?? {});
  // LLM-free, so no tokens/cost to attribute.
  return { output: summary, tokensUsed: 0, costUsd: 0 };
}

/** Register the step executor. Called from `initFramework()`. */
export function registerProactiveGuidanceStep(): void {
  registerStepType(PROACTIVE_GUIDANCE_STEP_TYPE, executeProactiveGuidance);
}

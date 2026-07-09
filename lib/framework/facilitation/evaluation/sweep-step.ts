/**
 * Scheduled eval sweep workflow step (f-governance-plus t-3, spec §5.5 F14) — the scheduling seam
 * for framework conversation evaluation. f-eval shipped the scorers on-demand + per-conversation;
 * there is no framework periodic-task hook (the maintenance tick is Sunrise-owned + hard-coded), so
 * the fork-lawful way to run them on a schedule is a custom workflow STEP TYPE (the same
 * `registerStepType` seam f-overlays' proactive sweep uses): an operator authors a one-step workflow
 * of type `framework_eval_sweep` and points an `AiWorkflowSchedule` cron at it.
 *
 * The step selects recent framework conversations with an un-scored turn (`recent-conversations.ts`)
 * and runs the enabled passes over each — supervisor + rubric by default, metric scoring (3 judge
 * calls/turn) opt-in. It threads the execution's user (or the service account) as the eval actor, and
 * self-enforces the execution's `budgetLimitUsd` inside the loop as a hard cost fence (the engine
 * only checks the budget BETWEEN steps, and this is one long step). A conversation that fails a pass
 * (e.g. no scorable turns) is skipped, not fatal. Daybreak ships the step type but seeds NO
 * workflow/schedule row — a fresh fork boots clean; the operator wires it when they want it.
 *
 * Registered from `initFramework()` (server boot), not the core executor barrel, so it never affects
 * the core BE↔FE step-registry parity.
 */

import { z } from 'zod';
import type { StepResult, WorkflowStep } from '@/types/orchestration';
import type { ExecutionContext } from '@/lib/orchestration/engine/context';
import { registerStepType } from '@/lib/orchestration/engine/executor-registry';
import { ExecutorError } from '@/lib/orchestration/engine/errors';
import { prisma } from '@/lib/db/client';
import { serviceAccountWhere } from '@/lib/auth/account';
import { scoreConversation } from '@/lib/framework/facilitation/evaluation/score-conversation';
import { superviseConversation } from '@/lib/framework/facilitation/evaluation/supervise';
import { rubricScoreConversation } from '@/lib/framework/facilitation/evaluation/rubric';
import { listRecentUnscoredFrameworkConversations } from '@/lib/framework/facilitation/evaluation/recent-conversations';

/** The workflow step type an operator schedules to run the eval sweep. */
export const EVAL_SWEEP_STEP_TYPE = 'framework_eval_sweep';

/** Default number of conversations swept per run. */
const DEFAULT_MAX_CONVERSATIONS = 25;

/**
 * Per-step config. Supervisor + rubric run by default (per-conversation, bounded); metric scoring is
 * opt-in (3 judge calls per turn). At least one pass must be enabled.
 */
const configSchema = z
  .object({
    score: z.boolean().optional(),
    supervise: z.boolean().optional(),
    rubric: z.boolean().optional(),
    maxConversations: z.number().int().min(1).max(500).optional(),
  })
  .optional();

/** Resolve who the eval calls attribute to: the execution's user, else the service account. */
async function resolveActorUserId(step: WorkflowStep, ctxUserId: string | null): Promise<string> {
  if (ctxUserId) return ctxUserId;
  const account = await prisma.user.findFirst({ where: serviceAccountWhere, select: { id: true } });
  if (!account) {
    throw new ExecutorError(
      step.id,
      'NO_ACTOR',
      'framework_eval_sweep has no user to attribute to (the execution has no user and no service account exists)'
    );
  }
  return account.id;
}

/** The step executor. Exported for direct unit testing; registered via `registerEvalSweepStep`. */
export async function executeEvalSweep(
  step: WorkflowStep,
  ctx: Readonly<ExecutionContext>
): Promise<StepResult> {
  const parsed = configSchema.safeParse(step.config);
  if (!parsed.success) {
    throw new ExecutorError(
      step.id,
      'INVALID_CONFIG',
      `Invalid framework_eval_sweep config: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }
  const cfg = parsed.data ?? {};
  const doScore = cfg.score ?? false;
  const doSupervise = cfg.supervise ?? true;
  const doRubric = cfg.rubric ?? true;
  if (!doScore && !doSupervise && !doRubric) {
    throw new ExecutorError(
      step.id,
      'INVALID_CONFIG',
      'framework_eval_sweep must enable at least one pass (score, supervise, or rubric)'
    );
  }
  const maxConversations = cfg.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const actorUserId = await resolveActorUserId(step, ctx.userId);
  const conversations = await listRecentUnscoredFrameworkConversations(maxConversations);

  let sweptConversations = 0;
  let failedConversations = 0;
  let totalCostUsd = 0;
  let totalTokensUsed = 0;
  let budgetStopped = false;

  for (const conversation of conversations) {
    try {
      if (doScore) {
        const r = await scoreConversation({ conversationId: conversation.id, actorUserId });
        totalCostUsd += r.totalCostUsd;
      }
      if (doSupervise) {
        const r = await superviseConversation({ conversationId: conversation.id, actorUserId });
        totalCostUsd += r.costUsd;
        totalTokensUsed += r.tokensUsed;
      }
      if (doRubric) {
        const r = await rubricScoreConversation({ conversationId: conversation.id, actorUserId });
        totalCostUsd += r.totalCostUsd;
      }
      sweptConversations += 1;
    } catch (err) {
      // A single conversation failing a pass (e.g. no scorable turns) must not abort the whole sweep.
      failedConversations += 1;
      ctx.logger.warn('framework_eval_sweep: skipped a conversation whose pass failed', {
        conversationId: conversation.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Hard cost fence: the engine only checks budget between steps, so a long single step must stop
    // itself. `ctx.totalCostUsd` is the cost spent by earlier steps; add this step's running total.
    if (ctx.budgetLimitUsd !== undefined && ctx.totalCostUsd + totalCostUsd >= ctx.budgetLimitUsd) {
      budgetStopped = true;
      break;
    }
  }

  return {
    output: {
      candidateConversations: conversations.length,
      sweptConversations,
      failedConversations,
      passes: { score: doScore, supervise: doSupervise, rubric: doRubric },
      budgetStopped,
      totalCostUsd,
    },
    tokensUsed: totalTokensUsed,
    costUsd: totalCostUsd,
  };
}

/** Register the step executor. Called from `initFramework()`. */
export function registerEvalSweepStep(): void {
  registerStepType(EVAL_SWEEP_STEP_TYPE, executeEvalSweep);
}

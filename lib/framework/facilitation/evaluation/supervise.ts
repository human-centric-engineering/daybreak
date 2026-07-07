/**
 * Post-hoc supervisor over a framework conversation (f-eval t-2, spec §5.5 F14) — governance's
 * post-hoc face. Runs the existing neutral supervisor (`runSupervisorAssessment`, Sunrise-core) over
 * a whole framework (`facilitation`/`module`) conversation and stores the verdict on the
 * conversation's eval store.
 *
 * The supervisor core is workflow-execution-shaped (`stepOutputs`/`inputData`/`outputData`, and its
 * citation validator keys `evidenceStepId` on `stepOutputs`); this is the conversation-native
 * adapter that projects a conversation onto that shape:
 *   - one `stepOutputs` entry per Q/A turn, keyed `turn-N`, so the judge can cite a specific turn;
 *   - a framework-conversation **rubric** (replacing the core default's workflow-centric criteria);
 *   - the engine-free `llmCall` shim copied from the retroactive execution-review route
 *     (`getModel` → `getProvider` → `provider.chat`, cost via `calculateCost`/`logCost`).
 *
 * The verdict is upserted onto the LAST scorable turn's eval row — the natural conversation-level
 * anchor — so it works whether or not the metric scorer (t-1) has already scored the turns. Every
 * run is audited. Errors from the provider bubble up (the route surfaces a 500); a conversation with
 * no scorable turns is a `ValidationError`.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { logger } from '@/lib/logging';
import { CostOperation, type SupervisorReport } from '@/types/orchestration';
import { calculateCost, logCost } from '@/lib/orchestration/llm/cost-tracker';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { getModel } from '@/lib/orchestration/llm/model-registry';
import { getDefaultModelForTask } from '@/lib/orchestration/llm/settings-resolver';
import { JUDGE_MODEL } from '@/lib/orchestration/evaluations/judge-model';
import { runSupervisorAssessment, type LlmCallShim } from '@/lib/orchestration/supervisor';
import { loadFrameworkConversation } from '@/lib/framework/facilitation/evaluation/conversation';
import { listScorableTurns } from '@/lib/framework/facilitation/evaluation/turns';

const ENTITY_TYPE = 'framework_conversation_eval';

/**
 * The rubric — what "did its job" means for a framework conversation, replacing the core default's
 * workflow-centric criteria. Each turn is projected as `turn-N` in `stepOutputs`.
 */
const FRAMEWORK_ASSESSMENT_CRITERIA = [
  'Did each assistant turn genuinely address the user question that prompted it, rather than deflecting to an easier or adjacent question?',
  'Are the assistant turns internally consistent across the conversation — does a later turn contradict an earlier one?',
  'When a turn carried citations, do its claims stay within what those citations support (no grounding claimed beyond the evidence)?',
  "Did the assistant stay within the facilitation/module surface's remit, without overstepping guardrails or fabricating the user's journey / module state?",
  'Taken as a whole, did the conversation move the user forward appropriately, or did it stall, loop, or mislead?',
].join('\n');

/** Framework-conversation red-team checklist — replaces the core default's workflow failure modes. */
const FRAMEWORK_RED_TEAM_PROMPTS = [
  'Claims in an assistant turn that go beyond what its citations support (hallucinated grounding).',
  'An assistant turn that contradicts an earlier turn in the same conversation.',
  'A deflection dressed as an answer — the user asked X, the assistant confidently answered a different, easier question.',
  "Confident assertions about the user's journey or module state with no evidence in the turn.",
  "Guardrail or scope violations — advice or claims outside the surface's remit.",
  'Citations attached to a turn that do not actually support the specific claim being made.',
] as const;

export interface SuperviseConversationArgs {
  conversationId: string;
  /** The admin triggering the review — supervisor-call cost attributes here, and the audit actor. */
  actorUserId: string;
  clientIp?: string | null;
  /** Force a particular judge model; otherwise the configured `JUDGE_MODEL` (then chat default). */
  modelOverride?: string;
}

export interface SuperviseConversationResult {
  conversationId: string;
  /** The assistant `AiMessage` (last scorable turn) the verdict was stored on. */
  messageId: string;
  verdict: SupervisorReport['verdict'];
  score: number;
  summary: string;
  report: SupervisorReport;
  tokensUsed: number;
  costUsd: number;
}

/**
 * Supervise a framework conversation and persist the verdict on its terminal-turn eval row (upsert).
 * Throws `NotFoundError` (unknown conversation), `ValidationError` (not a framework surface, or no
 * scorable turns), or an unknown-model `ValidationError`.
 */
export async function superviseConversation(
  args: SuperviseConversationArgs
): Promise<SuperviseConversationResult> {
  const { conversationId, actorUserId, clientIp, modelOverride } = args;

  const conversation = await loadFrameworkConversation(conversationId);

  const turns = await listScorableTurns(conversationId);
  if (turns.length === 0) {
    throw new ValidationError('This conversation has no scorable turns to supervise', {
      conversationId: ['No paired user→assistant turns were found to audit'],
    });
  }

  // Project the conversation onto the supervisor's workflow-shaped input: one entry per Q/A turn,
  // keyed `turn-N` so the judge can cite a specific turn. Each value carries the question, the
  // response, and the citations so evidence quotes can be drawn from any of them.
  const stepOutputs: Record<string, unknown> = {};
  turns.forEach((turn, index) => {
    stepOutputs[`turn-${index + 1}`] = {
      userQuestion: turn.userQuestion,
      aiResponse: turn.aiResponse,
      citations: turn.citations,
    };
  });
  const terminalTurn = turns[turns.length - 1];

  // Resolve the judge model + provider (same precedence as the retroactive execution-review route):
  // explicit override > EVALUATION_JUDGE_MODEL env > system default chat model.
  const modelId = modelOverride ?? JUDGE_MODEL ?? (await getDefaultModelForTask('chat'));
  const modelInfo = getModel(modelId);
  if (!modelInfo) {
    throw new ValidationError('Unknown model', {
      modelOverride: [`Model "${modelId}" is not in the model registry`],
    });
  }
  const provider = await getProvider(modelInfo.provider);

  // Provider-agnostic LLM shim (copied from the execution-review route). Bills cost per call as a
  // side-effect, attributed to the framework conversation; the shared core treats this as opaque.
  const llmCall: LlmCallShim = async (prompt, opts) => {
    const response = await provider.chat([{ role: 'user', content: prompt }], {
      model: modelId,
      temperature: opts.temperature,
    });
    const cost = calculateCost(modelId, response.usage.inputTokens, response.usage.outputTokens);
    void logCost({
      conversationId,
      model: modelId,
      provider: modelInfo.provider,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      operation: CostOperation.EVALUATION,
      isLocal: cost.isLocal,
      metadata: { phase: 'framework_conversation_supervisor' },
    }).catch((err: unknown) => {
      logger.warn('framework conversation supervisor: cost log failed', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return {
      content: response.content,
      tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
      costUsd: cost.totalCostUsd,
    };
  };

  const assessment = await runSupervisorAssessment({
    stepOutputs,
    inputData: {
      conversationId,
      contextType: conversation.contextType,
      contextId: conversation.contextId,
      turnCount: turns.length,
    },
    outputData: { finalResponse: terminalTurn.aiResponse },
    // The supervisor core labels these "Workflow id" / "Workflow execution id" in its prompt; for a
    // conversation the natural identifiers are the surface + conversation id.
    workflowId: `framework-conversation:${conversation.contextType}`,
    executionId: conversationId,
    assessmentCriteria: FRAMEWORK_ASSESSMENT_CRITERIA,
    redTeamPrompts: FRAMEWORK_RED_TEAM_PROMPTS,
    requireEvidenceCitations: true,
    minWeaknesses: 1,
    // Conversations are short and every turn matters equally (no linear terminal step), so give the
    // judge the full text of every turn rather than truncating.
    includeStepOutputs: 'all',
    temperature: 0.2,
    llmCall,
    triggeredBy: 'retroactive',
  });

  const report = assessment.report;
  const reportJson = report as unknown as Prisma.InputJsonValue;

  // Anchor the conversation-level verdict on the terminal turn's eval row. Upsert so it works whether
  // or not the metric scorer (t-1) already created a row for this turn: create carries the framework
  // identifiers; update touches only the supervisor column, leaving any existing scores intact.
  const row = await prisma.frameworkConversationEval.upsert({
    where: { messageId: terminalTurn.messageId },
    create: {
      messageId: terminalTurn.messageId,
      conversationId,
      contextType: conversation.contextType,
      contextId: conversation.contextId,
      supervisorReport: reportJson,
    },
    update: { supervisorReport: reportJson },
  });

  logAdminAction({
    userId: actorUserId,
    action: 'framework_conversation_eval.supervise',
    entityType: ENTITY_TYPE,
    entityId: conversationId,
    entityName: conversation.contextId ?? conversation.contextType,
    metadata: {
      conversationId,
      contextType: conversation.contextType,
      messageId: terminalTurn.messageId,
      turnCount: turns.length,
      verdict: report.verdict,
      score: report.score,
      tokensUsed: assessment.tokensUsed,
      costUsd: assessment.costUsd,
    },
    clientIp: clientIp ?? null,
  });

  return {
    conversationId,
    messageId: row.messageId,
    verdict: report.verdict,
    score: report.score,
    summary: report.summary,
    report,
    tokensUsed: assessment.tokensUsed,
    costUsd: assessment.costUsd,
  };
}

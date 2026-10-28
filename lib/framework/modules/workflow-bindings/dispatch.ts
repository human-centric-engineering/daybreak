/**
 * Module workflow-binding dispatch (f-module-bindings t-3, reconciliation #4).
 *
 * `runModuleWorkflowBindings(moduleSlug, eventType, payload)` is the "event → workflow"
 * entry: it resolves the enabled bindings for `(module, eventType)` and runs each
 * bound workflow via the **existing** execution machinery — create a PENDING
 * `AiWorkflowExecution` pinned to the workflow's published version, then
 * `drainEngine(...)` fire-and-forget. No new engine, no new run path; this mirrors the
 * scheduler and inbound-trigger dispatch exactly (spec §4.2 says lifecycle events run
 * a workflow — `emitHookEvent` is outbound-webhook-only and can't, so this uses
 * `drainEngine` like every other row→workflow trigger).
 *
 * **Nothing calls this yet.** The module-lifecycle *event source* (what fires
 * `module.entered` / `module.completed`) is **f-engagement** (08); t-3 ships the
 * dispatch callable/testable in isolation and f-engagement wires the real event later
 * (the 08/09 `JourneyEvent` coordination — no hard dependency edge). It is written to
 * be safe to call directly: an unknown module or an event with no bindings is a clean
 * no-op, and a binding whose workflow is inactive / unpublished / malformed is skipped
 * (logged), never allowed to abort the others.
 *
 * **A writer of a column erasure scrubs** (Sunrise 0.16.0 §122): the run's `inputData` is a copy
 * of the binding's template, and the definition it runs a copy of the published version, both
 * read before the run is written. An erasure committing in between has blanked the person in
 * both (`lib/framework/privacy/erasure.ts` for the template, core for the version), so the run is
 * written the way core's scheduler writes one: under the locks erasure takes for everyone the two
 * name, leaving out anyone erased since they were read. An erasure that has not committed waits
 * for the run's transaction, then redacts the new run with the other unfinished ones. Declared as
 * a stale writer (`taken-at`) by `initFrameworkErasureHooks()`. The event payload is the request's
 * own and is not checked (core's `intent`, as the inbound triggers).
 */

import type { AiWorkflowExecution, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { isRecord } from '@/lib/utils';
import { WorkflowStatus } from '@/types/orchestration';
import { workflowDefinitionSchema } from '@/lib/validations/orchestration';
import { drainEngine } from '@/lib/orchestration/scheduling/scheduler';
import { runAcrossOwners } from '@/lib/auth/subject-context';
import { resolveMaxCostPerExecution } from '@/lib/orchestration/llm/cost-caps';
import { withoutErasedRecipients } from '@/lib/orchestration/workflows/version-service';
import { definitionRecipients } from '@/lib/privacy/config-recipients';
import { blankAddressInTemplate } from '@/lib/privacy/run-recipients';
import {
  boundLockWaits,
  findErasedSubjects,
  stringsIn,
  WRITER_TRANSACTION_OPTIONS,
  type ErasedSubjects,
} from '@/lib/privacy/erased-subjects';

/** Attribution source pinned on executions triggered by a module lifecycle event. */
const TRIGGER_SOURCE = 'module-event';

/**
 * How long a run's transaction waits for erasure's locks: inside `WRITER_TRANSACTION_OPTIONS`,
 * past an erasure's 60 s. Only a person the binding names being erased right now makes it wait.
 * A wait that runs out skips the binding (`execution_create_failed`), as any failed insert does.
 */
const SUBJECT_LOCK_WAIT_MS = WRITER_TRANSACTION_OPTIONS.timeout - 5_000;

/** `template` with every erased address blanked, by the rule erasure applies to it. */
function withoutErasedAddresses(
  template: Prisma.JsonValue,
  erased: ErasedSubjects
): Prisma.JsonValue {
  let value = template;
  for (const address of erased.addresses) {
    value = blankAddressInTemplate(value, address)?.value ?? value;
  }
  return value;
}

export interface ModuleWorkflowDispatchResult {
  moduleSlug: string;
  eventType: string;
  /** Enabled bindings found for `(module, eventType)`. */
  matched: number;
  /** Executions created and drained. */
  dispatched: number;
  /** Bindings that matched but did not run, with the reason. */
  skipped: Array<{ bindingId: string; workflowId: string; reason: string }>;
}

/**
 * Run every enabled workflow bound to `(moduleSlug, eventType)`. Each run's input is
 * the operator's static `inputTemplate` merged under a live `event` envelope
 * (`{ event: { moduleSlug, eventType, payload } }` — the envelope wins on key
 * collision, so a workflow always finds the event data at `input.event`). Returns a
 * summary; the workflows themselves run asynchronously (fire-and-forget drain).
 */
export async function runModuleWorkflowBindings(
  moduleSlug: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<ModuleWorkflowDispatchResult> {
  const result: ModuleWorkflowDispatchResult = {
    moduleSlug,
    eventType,
    matched: 0,
    dispatched: 0,
    skipped: [],
  };

  // Before the reads below: the moment the copies of the templates and definitions were taken.
  const readAt = new Date();

  const moduleRow = await prisma.module.findFirst({
    where: { slug: moduleSlug },
    select: { id: true },
  });
  if (!moduleRow) {
    // An event for an unregistered / unknown module fires nothing. Not an error —
    // the event source is decoupled from the module registry.
    logger.warn('Module workflow dispatch: unknown module, no bindings run', {
      moduleSlug,
      eventType,
    });
    return result;
  }

  const bindings = await prisma.moduleWorkflowBinding.findMany({
    where: { moduleId: moduleRow.id, eventType, enabled: true },
  });
  result.matched = bindings.length;
  if (bindings.length === 0) return result;

  // Batch-fetch the bound workflows (no @relation → no include) with the fields the
  // dispatch needs: liveness, cost cap, and the published version to pin + run.
  const workflowIds = [...new Set(bindings.map((b) => b.workflowId))];
  const workflows = await prisma.aiWorkflow.findMany({
    where: { id: { in: workflowIds } },
    select: {
      id: true,
      slug: true,
      isActive: true,
      maxCostPerExecutionUsd: true,
      publishedVersion: { select: { id: true, snapshot: true } },
    },
  });
  const byId = new Map(workflows.map((w) => [w.id, w]));

  // Org-wide default cost cap, resolved once for the whole fan-out.
  const orgSettings = await prisma.aiOrchestrationSettings.findUnique({
    where: { slug: 'global' },
    select: { defaultMaxCostPerExecutionUsd: true },
  });
  const settingsDefault = orgSettings?.defaultMaxCostPerExecutionUsd ?? null;

  for (const binding of bindings) {
    const skip = (reason: string): void => {
      result.skipped.push({ bindingId: binding.id, workflowId: binding.workflowId, reason });
      logger.warn('Module workflow dispatch: binding skipped', {
        moduleSlug,
        eventType,
        bindingId: binding.id,
        workflowId: binding.workflowId,
        reason,
      });
    };

    const workflow = byId.get(binding.workflowId);
    if (!workflow) {
      skip('workflow_not_found');
      continue;
    }
    if (!workflow.isActive) {
      skip('workflow_inactive');
      continue;
    }
    if (!workflow.publishedVersion) {
      skip('no_published_version');
      continue;
    }

    const defParsed = workflowDefinitionSchema.safeParse(workflow.publishedVersion.snapshot);
    if (!defParsed.success) {
      skip('invalid_definition');
      continue;
    }

    const budgetLimitUsd = resolveMaxCostPerExecution({
      callerOverride: null,
      workflowDefault: workflow.maxCostPerExecutionUsd,
      settingsDefault,
    });

    const { publishedVersion } = workflow;
    const named = definitionRecipients(publishedVersion.snapshot);
    const subjects = {
      addresses: [...stringsIn(binding.inputTemplate), ...named.addresses],
      userIds: named.userIds,
    };

    try {
      const created: {
        execution: AiWorkflowExecution;
        inputData: Record<string, unknown>;
        erased: ErasedSubjects;
      } = await prisma.$transaction(async (tx) => {
        await boundLockWaits(tx, SUBJECT_LOCK_WAIT_MS);
        // Erased since the read, not ever (core's §122 rule): an address an operator re-entered
        // in the template after an older erasure is theirs, on purpose, and reaches the run.
        const erased = await findErasedSubjects(tx, subjects, { since: readAt });
        const template =
          binding.inputTemplate === null
            ? null
            : withoutErasedAddresses(binding.inputTemplate, erased);
        const inputData: Record<string, unknown> = {
          ...(isRecord(template) ? template : {}),
          event: { moduleSlug, eventType, payload },
        };
        const execution = await tx.aiWorkflowExecution.create({
          data: {
            workflowId: workflow.id,
            versionId: publishedVersion.id,
            status: WorkflowStatus.PENDING,
            inputData: inputData as Prisma.InputJsonValue,
            executionTrace: [],
            userId: binding.createdBy,
            triggerSource: TRIGGER_SOURCE,
            ...(budgetLimitUsd !== undefined ? { budgetLimitUsd } : {}),
          },
        });
        return { execution, inputData, erased };
      }, WRITER_TRANSACTION_OPTIONS);
      const { execution, inputData, erased } = created;
      if (erased.addresses.length > 0 || erased.userIds.length > 0) {
        // Never the address: it is what was erased.
        logger.warn('Module workflow dispatch: left out people whose data was erased from a run', {
          moduleSlug,
          eventType,
          bindingId: binding.id,
          executionId: execution.id,
          addresses: erased.addresses.length,
          userIds: erased.userIds.length,
        });
      }

      // Fire-and-forget — the workflow runs asynchronously; identical crash handling
      // to the scheduler / inbound paths (drainEngine repairs the row on failure).
      //
      // Across owners (Sunrise §115): a member's chat or feedback request starts this, and a
      // fire-and-forget run inherits that member's narrowed subject. The execution is the
      // binding's — owned by `binding.createdBy`, or by nobody — so the engine's own reads and
      // repair writes of it would be refused as another person's row, and the workflow would
      // never run. Core declares the same crossing for `resumeApprovedExecution()`.
      void runAcrossOwners(
        "a module event runs its binding's workflow, not the triggering member's",
        () =>
          drainEngine(
            execution.id,
            { id: workflow.id, slug: workflow.slug },
            withoutErasedRecipients(defParsed.data, erased),
            inputData,
            binding.createdBy,
            publishedVersion.id
          )
      );

      result.dispatched++;
    } catch (err) {
      // A failed execution-row insert must not abort the other bindings.
      logger.error(
        'Module workflow dispatch: failed to create execution',
        err instanceof Error ? err : new Error(String(err)),
        { moduleSlug, eventType, bindingId: binding.id, workflowId: workflow.id }
      );
      skip('execution_create_failed');
    }
  }

  logger.info('Module workflow dispatch complete', {
    moduleSlug,
    eventType,
    matched: result.matched,
    dispatched: result.dispatched,
    skipped: result.skipped.length,
  });

  return result;
}

/**
 * The engagement emit seam (f-engagement t-1, spec §4.3).
 *
 * `recordModuleEngagement(...)` is the one place a module engagement event enters the
 * system. It has **two isolated, best-effort limbs**:
 *
 *  1. **The durable event** — insert one `JourneyEvent` row (the insert-only stats feed,
 *     A9 — the read side aggregates it, never a counter).
 *  2. **The workflow trigger** — fire the module→workflow bindings for `(module, type)`
 *     via `runModuleWorkflowBindings`, so an operator's "when a user enters this module,
 *     run workflow Y" actually fires. This is the first production caller of that
 *     receiver (f-module-bindings shipped it callable-but-unwired). The receiver already
 *     dispatches each workflow fire-and-forget through `drainEngine`.
 *
 * Both limbs are wrapped so a failure in either is logged and swallowed: engagement
 * instrumentation must never be able to throw into — or slow — a live chat turn, and a
 * failed event write must not skip the binding fire (nor vice-versa). Callers therefore
 * invoke this **fire-and-forget** (`void recordModuleEngagement(...)`); it never rejects.
 *
 * Operator lifecycle changes (module status edits) are deliberately NOT engagement
 * events — they have no subject user, so they do not belong in this `userId`-keyed,
 * erasable stream (decision 2). This seam is for genuine per-user engagement only.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { runModuleWorkflowBindings } from '@/lib/framework/modules/workflow-bindings';

/** One module engagement event to record. `type` is an {@link ENGAGEMENT_EVENT_TYPE} value. */
export interface RecordModuleEngagementInput {
  userId: string;
  moduleSlug: string;
  type: string;
  /** Event-specific data stored on the row and forwarded to bound workflows. */
  payload?: Record<string, unknown>;
  /** Set for journey-linked engagement; omitted (null) for non-journey events like an entry. */
  journeyId?: string;
}

/**
 * Record a module engagement event: write it to the stream and fire its workflow
 * bindings. Best-effort and non-throwing — safe to call fire-and-forget from a request
 * path. Resolves once both limbs have been attempted.
 */
export async function recordModuleEngagement(input: RecordModuleEngagementInput): Promise<void> {
  const { userId, moduleSlug, type, payload, journeyId } = input;

  // Limb 1 — the durable engagement event (the stats feed). Isolated: a write failure is
  // logged and swallowed so it can neither throw to the caller nor skip limb 2. `userId`
  // is a column (the erasure path), so the row is minimal; `occurredAt` defaults to now().
  try {
    await prisma.journeyEvent.create({
      data: {
        userId,
        moduleSlug,
        type,
        ...(journeyId !== undefined ? { journeyId } : {}),
        ...(payload !== undefined ? { payload: payload as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    logger.error(
      'recordModuleEngagement: failed to write engagement event',
      err instanceof Error ? err : new Error(String(err)),
      { userId, moduleSlug, type }
    );
  }

  // Limb 2 — fire the module→workflow bindings. Isolated the same way. `userId` is injected
  // into the forwarded payload because a bound workflow only sees `input.event` and would
  // otherwise not know who triggered it (the event row carries userId as a column).
  try {
    await runModuleWorkflowBindings(moduleSlug, type, { userId, ...(payload ?? {}) });
  } catch (err) {
    logger.error(
      'recordModuleEngagement: workflow-binding dispatch failed',
      err instanceof Error ? err : new Error(String(err)),
      { userId, moduleSlug, type }
    );
  }
}

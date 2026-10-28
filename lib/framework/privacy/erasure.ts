/**
 * The framework tier's part in account erasure (GDPR Art. 17) — reached through the
 * `lib/app/erasure.ts` bridge (Sunrise 0.16.0, §122).
 *
 * A module workflow binding's `inputTemplate` is the operator's static input to a bound
 * workflow, the `AiWorkflowSchedule.inputTemplate` precedent (`framework-modules.prisma`). Core
 * erasure blanks an erased person's address in every schedule template (`eraseFromRunInputs`,
 * t-804) and has no idea a binding template exists, so before this a person typed into one
 * survived their erasure there, and was written into every run the binding started. Two things
 * close that, as they do for a schedule:
 *
 *  1. **Erasure blanks the address in every binding template** — {@link eraseFromBindingTemplates},
 *     a `scrubInTransaction` hook, so it commits or rolls back with the rest of the erasure. Only
 *     the address, and only for a verified account, by core's rule: an unverified address may be a
 *     stranger's (`webhookDeliveriesAddressedTo`), and an id in a free-form template is not a
 *     recipient erasure has a disposition for (`blankAddressInTemplate`). Blanked to `''`, so the
 *     step it feeds fails as one with no recipient.
 *  2. **The dispatcher leaves out anyone erased since it read the binding** — declared here as a
 *     stale writer, because Sunrise's `stale-writers.test.ts` reads the registrations this init
 *     makes and fails on a writer of a scrubbed column that has not said how it knows its copy is
 *     stale. The mechanism is in `lib/framework/modules/workflow-bindings/dispatch.ts`.
 *
 * **Not covered: an operator's edit of a binding template.** It writes the whole template from the
 * request (`updateModuleWorkflowBinding`), so a form opened before an erasure and saved after it
 * puts the address back, the hole core closed for its own configuration with versioned saves
 * (t-899). Daybreak's binding is not one of core's scrubbed columns, so no guard asks; the
 * follow-up is Hub t-151.
 *
 * Registered from `initAppErasureHooks()`, not from `initFramework()` at boot: core's registry
 * runs that lazily before its first read and re-runs it after a reset, so a boot-time
 * registration would be lost — and the stale-writer test never runs `initFramework()`.
 *
 * @see lib/app/erasure.ts — the bridge · lib/privacy/erasure-hooks.ts — the registry
 * @see lib/privacy/run-recipients.ts — `eraseFromSchedules`, which this mirrors
 */

import type { Prisma } from '@prisma/client';
import { blankAddressInTemplate } from '@/lib/privacy/run-recipients';
import {
  registerErasureCleanupHook,
  registerStaleWriter,
  type ErasureTxContext,
} from '@/lib/privacy/erasure-hooks';
import { normaliseAddress } from '@/lib/orchestration/webhooks/destination';

/** The binding's audit `entityType`, as `lib/framework/modules/workflow-bindings/service.ts` writes it. */
const ENTITY_TYPE = 'module_workflow_binding';

const ERASURE_REASON = 'A person this binding named was erased.';

/** Bindings read per page. A binding is configuration, so there are few; paged all the same. */
export const BINDING_PAGE_SIZE = 200;

/**
 * How many times one binding's blanking is retried when its template changed between the read and
 * the write. An operator saving the same binding again and again during one erasure is the only
 * way past it, and the erasure attempt then fails whole, as any throw inside its transaction does.
 */
export const BINDING_WRITE_ATTEMPTS = 5;

/** The hook's `name`: the registry is keyed by it, so a re-run replaces rather than duplicates. */
export const BINDING_TEMPLATES_HOOK = 'framework:module-workflow-binding-templates';

/** The dispatcher, as the stale-writer test names a file. */
export const DISPATCH_FILE = 'lib/framework/modules/workflow-bindings/dispatch.ts';

/**
 * Blank the erased person's address in every module workflow binding's input template, inside
 * the erasure transaction, each change audited. Returns how many bindings changed.
 *
 * Every org's bindings, deliberately: erasure runs in the system scope at `multi` and a person's
 * address can sit in any org's configuration, as core's schedule pass reads every schedule. Matched
 * on the address the user row stores, normalised as core matches it; nothing for an unverified
 * account.
 */
export async function eraseFromBindingTemplates({
  tx,
  email,
  emailVerified,
}: ErasureTxContext): Promise<number> {
  if (!emailVerified) return 0;
  const address = normaliseAddress(email);
  let changed = 0;
  let after: string | undefined;
  for (;;) {
    const rows = await tx.moduleWorkflowBinding.findMany({
      ...(after !== undefined ? { where: { id: { gt: after } } } : {}),
      orderBy: { id: 'asc' },
      take: BINDING_PAGE_SIZE,
      select: {
        id: true,
        moduleId: true,
        eventType: true,
        workflowId: true,
        orgId: true,
        inputTemplate: true,
      },
    });
    for (const row of rows) {
      const removed = await blankInBinding(tx, row.id, row.inputTemplate, address);
      if (removed === 0) continue;
      // Unattributed: a cleanup hook is not told who asked for the erasure. The erasure's own
      // receipt and audit row name them.
      await tx.aiAdminAuditLog.create({
        data: {
          userId: null,
          action: 'module_workflow_binding.recipient_erased',
          entityType: ENTITY_TYPE,
          entityId: row.id,
          entityName: `${row.eventType} → ${row.workflowId}`,
          changes: { inputTemplateValuesCleared: { from: removed, to: 0 } },
          metadata: {
            reason: ERASURE_REASON,
            moduleId: row.moduleId,
            workflowId: row.workflowId,
            orgId: row.orgId,
          },
        },
      });
      changed += 1;
    }
    if (rows.length < BINDING_PAGE_SIZE) break;
    after = rows[rows.length - 1].id;
  }
  return changed;
}

/**
 * Blank `address` in one binding's template, written only if the template is still the one it was
 * read as: an operator's edit committed in between is not overwritten, but read again and blanked
 * in turn. Core's schedule pass gets the same guarantee from a row lock (`FOR NO KEY UPDATE`); this
 * compares instead, which needs no raw SQL. Returns how many values it removed.
 */
async function blankInBinding(
  tx: ErasureTxContext['tx'],
  id: string,
  read: Prisma.JsonValue,
  address: string
): Promise<number> {
  let current = read;
  for (let attempt = 0; attempt < BINDING_WRITE_ATTEMPTS; attempt++) {
    if (current === null) return 0;
    const change = blankAddressInTemplate(current, address);
    if (!change) return 0;
    const { count } = await tx.moduleWorkflowBinding.updateMany({
      where: { id, inputTemplate: { equals: current } },
      data: { inputTemplate: change.value ?? {} },
    });
    if (count === 1) return change.removed;
    const again = await tx.moduleWorkflowBinding.findUnique({
      where: { id },
      select: { inputTemplate: true },
    });
    if (!again) return 0; // deleted in between: nothing left to blank
    current = again.inputTemplate;
  }
  throw new Error(`Module workflow binding ${id} kept changing while erasure blanked it`);
}

/**
 * Register the framework's erasure hook and its stale writer. Synchronous and idempotent: both
 * registries are keyed, so the re-run after a registry reset replaces what it registered.
 */
export function initFrameworkErasureHooks(): void {
  registerErasureCleanupHook({
    name: BINDING_TEMPLATES_HOOK,
    scrubInTransaction: async (ctx) => {
      await eraseFromBindingTemplates(ctx);
    },
  });
  registerStaleWriter({
    file: DISPATCH_FILE,
    model: 'AiWorkflowExecution',
    anchor: 'taken-at',
    how:
      "Creates a run from a binding's template and the workflow's published definition, with " +
      "anyone erased since it read them blanked and taken out, under erasure's locks: the " +
      "scheduler's rule; the member the event names is checked the same way. The rest of the " +
      "event payload is the request's own (intent).",
  });
}

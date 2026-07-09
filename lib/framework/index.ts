/**
 * Framework aggregate init — the single entry the boot seam calls.
 *
 * `initFramework()` runs once at server startup, invoked by the fork-owned boot
 * bridge `lib/app/bootstrap.ts` (which core's `instrumentation.ts` reaches via
 * the generic `initApp()` seam). It registers the framework's pieces into
 * Sunrise's seams from HERE — never by editing the leaf `lib/app/*` scaffolds,
 * which stay empty for Daybreak's own forks (three-tier model; see
 * `.context/framework/README.md`).
 *
 * Today it registers one thing: the "module" prompt-context contributor (an
 * empty scaffold). More registrations join as features land (`f-module-core`, …).
 * Idempotent — `registerContextContributor` replaces per type, so a double boot
 * is harmless.
 *
 * `syncFramework()` is the framework's single aggregate *async* boot step: work that
 * must run *after* every tier has registered (framework + leaf). It syncs the module
 * registry into `framework_module` rows, then the module-declared slot definitions
 * into `framework_slot_definition` rows (slots are collected *from* registered
 * modules), then registers module-declared capabilities — both the in-memory
 * dispatcher handlers and their `ai_capability` metadata rows. The capability
 * registration lives HERE, not in `initFramework()`, because the leaf's modules
 * aren't registered until `initLeafApp()` (which runs *between* the two). Later
 * features add their own passes here, so the boot bridge (`lib/app/bootstrap.ts`)
 * never changes — its sequence stays `initFramework()` → `initLeafApp()` →
 * `syncFramework()`.
 */

import { registerContextContributor } from '@/lib/orchestration/chat/context-builder';
import { registerAgentAccessContributor } from '@/lib/orchestration/knowledge/agent-access-contributors';
import { registerGuardFloorContributor } from '@/lib/orchestration/chat/guard-floor';
import { registerGuardEventContributor } from '@/lib/orchestration/chat/guard-events';
import {
  resolveFacilitationGuardFloor,
  FACILITATION_GUARD_FLOOR_KEY,
} from '@/lib/framework/facilitation/policies/guard-floor';
import {
  handleFacilitationGuardEvent,
  FACILITATION_ESCALATION_KEY,
} from '@/lib/framework/facilitation/policies/escalation';
import { loadModuleContext, MODULE_CONTEXT_TYPE } from '@/lib/framework/modules/context';
import {
  resolveModuleKnowledgeForAgent,
  MODULE_KNOWLEDGE_CONTRIBUTOR_KEY,
} from '@/lib/framework/modules/knowledge/contributor';
import { syncRegisteredModules } from '@/lib/framework/modules/sync';
import { syncRegisteredSlotDefinitions } from '@/lib/framework/data-slots/sync';
import { registerRegisteredModuleCapabilities } from '@/lib/framework/modules/capabilities/register';
import { syncRegisteredModuleCapabilities } from '@/lib/framework/modules/capabilities/sync';
import {
  registerFrameworkCapability,
  registerFrameworkCapabilityHandlers,
} from '@/lib/framework/capabilities/registry';
import { syncFrameworkCapabilities } from '@/lib/framework/capabilities/sync';
import { dataSlotCapabilities } from '@/lib/framework/data-slots/capabilities';
import { guidanceCapabilities } from '@/lib/framework/guidance/capabilities';
import { engagementCapabilities } from '@/lib/framework/engagement/capabilities';
import { emergenceCapabilities } from '@/lib/framework/facilitation/emergence/capabilities';
import { registerProactiveGuidanceStep } from '@/lib/framework/facilitation/overlays/proactive-step';
import { registerEvalSweepStep } from '@/lib/framework/facilitation/evaluation/sweep-step';

export function initFramework(): void {
  registerContextContributor(MODULE_CONTEXT_TYPE, loadModuleContext);
  // Module knowledge scope: a restricted agent bound to a module inherits that module's
  // documents/tags, unioned live by the core resolver. Registration is in-memory (the
  // contributor queries the DB only when the resolver calls it), so it belongs at init;
  // it is module-registry-independent (it reads bindings at resolve time). (t-4)
  registerAgentAccessContributor(MODULE_KNOWLEDGE_CONTRIBUTOR_KEY, resolveModuleKnowledgeForAgent);
  // Facilitation guard minimums (f-policies t-3, F16): a `guard_minimum` policy scoped to a
  // facilitation role raises the inline guard floor for that role's surface, via the generic core
  // guard-floor seam. In-memory registration (the contributor queries the DB at resolve time).
  registerGuardFloorContributor(FACILITATION_GUARD_FLOOR_KEY, resolveFacilitationGuardFloor);
  // Facilitation escalation (f-emergence t-1, F15): an `escalation` policy scoped to a facilitation
  // role turns a guard firing on that role's surface into a notify + log pathway, via the generic
  // post-detection guard-event core seam. Fire-and-forget at the guard site.
  registerGuardEventContributor(FACILITATION_ESCALATION_KEY, handleFacilitationGuardEvent);
  // Framework built-in capabilities (get_state, guidance read tools, …) — framework-owned,
  // not leaf- or module-dependent, so they register here at init. The dispatcher-handler +
  // DB-row passes run in `syncFramework()` below.
  for (const capability of dataSlotCapabilities) registerFrameworkCapability(capability);
  for (const capability of guidanceCapabilities) registerFrameworkCapability(capability);
  for (const capability of engagementCapabilities) registerFrameworkCapability(capability);
  // Emergence authoring (f-governance-plus t-2, F17): `submit_proposal`, letting a facilitation-seat
  // agent author a pending structure-change proposal for human approval.
  for (const capability of emergenceCapabilities) registerFrameworkCapability(capability);
  // Proactive guidance (f-overlays t-3b, F13): the `framework_proactive_guidance` workflow step type,
  // so an operator can schedule the throttled nudge sweep via an `AiWorkflowSchedule` cron. Registering
  // the BE executor at init (the engine runs server-side); no workflow/schedule row is seeded.
  registerProactiveGuidanceStep();
  // Scheduled eval sweep (f-governance-plus t-3, F14): the `framework_eval_sweep` workflow step type,
  // so an operator can cron the f-eval scorers + framework-rubric judge over recent framework
  // conversations via an `AiWorkflowSchedule`. BE executor registered at init; no schedule row seeded.
  registerEvalSweepStep();
}

export async function syncFramework(): Promise<void> {
  // In-memory capability handlers FIRST — pure, no DB dependency. If a DB sync below
  // throws on a transient boot-time DB error (which `lib/app/bootstrap.ts` tolerates),
  // the handlers are still registered, so a module capability whose `ai_capability` row
  // persisted from a prior boot stays dispatchable rather than vanishing for the whole
  // process (module caps, unlike built-ins, have no lazy self-heal). Requires modules
  // to be registered, which `initLeafApp()` did before `syncFramework()` ran.
  registerRegisteredModuleCapabilities();
  registerFrameworkCapabilityHandlers();
  await syncRegisteredModules();
  await syncRegisteredSlotDefinitions();
  await syncRegisteredModuleCapabilities();
  await syncFrameworkCapabilities();
}

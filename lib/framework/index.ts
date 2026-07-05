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
import { loadModuleContext, MODULE_CONTEXT_TYPE } from '@/lib/framework/modules/context';
import { syncRegisteredModules } from '@/lib/framework/modules/sync';
import { syncRegisteredSlotDefinitions } from '@/lib/framework/data-slots/sync';
import { registerRegisteredModuleCapabilities } from '@/lib/framework/modules/capabilities/register';
import { syncRegisteredModuleCapabilities } from '@/lib/framework/modules/capabilities/sync';

export function initFramework(): void {
  registerContextContributor(MODULE_CONTEXT_TYPE, loadModuleContext);
}

export async function syncFramework(): Promise<void> {
  // In-memory capability handlers FIRST — pure, no DB dependency. If a DB sync below
  // throws on a transient boot-time DB error (which `lib/app/bootstrap.ts` tolerates),
  // the handlers are still registered, so a module capability whose `ai_capability` row
  // persisted from a prior boot stays dispatchable rather than vanishing for the whole
  // process (module caps, unlike built-ins, have no lazy self-heal). Requires modules
  // to be registered, which `initLeafApp()` did before `syncFramework()` ran.
  registerRegisteredModuleCapabilities();
  await syncRegisteredModules();
  await syncRegisteredSlotDefinitions();
  await syncRegisteredModuleCapabilities();
}

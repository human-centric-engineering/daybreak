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
 * `syncFramework()` is the framework's single aggregate *async* boot step: DB work
 * that must run *after* every tier has registered (framework + leaf). Today it
 * syncs the module registry into `framework_module` rows; later features add their
 * own sync passes here, so the boot bridge (`lib/app/bootstrap.ts`) never changes —
 * its sequence stays `initFramework()` → `initLeafApp()` → `syncFramework()`.
 */

import { registerContextContributor } from '@/lib/orchestration/chat/context-builder';
import { loadModuleContext, MODULE_CONTEXT_TYPE } from '@/lib/framework/modules/context';
import { syncRegisteredModules } from '@/lib/framework/modules/sync';

export function initFramework(): void {
  registerContextContributor(MODULE_CONTEXT_TYPE, loadModuleContext);
}

export async function syncFramework(): Promise<void> {
  await syncRegisteredModules();
}

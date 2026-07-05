/**
 * In-memory registration of module-declared capabilities into the global
 * dispatcher (f-module-bindings t-2, decision A8).
 *
 * For every registered module, each declared capability is wrapped
 * (`namespaceModuleCapability`) and registered under its namespaced slug
 * `<module-slug>.<tool>`. This is the *handler* half — the dispatcher needs an
 * in-memory `BaseCapability` to actually run a tool; the `ai_capability` DB row
 * (`sync.ts`) is the metadata half that lets an agent be granted it.
 *
 * **Runs from `syncFramework()`, not `initFramework()`.** Boot order is
 * `initFramework() → initLeafApp() → syncFramework()`, and the leaf's modules are
 * registered in `initLeafApp()` — so at `initFramework()` time there is nothing to
 * read. `syncFramework()` is the first point after every tier has registered.
 *
 * Idempotent: the dispatcher keys handlers by slug, so a repeat (HMR, double boot)
 * replaces rather than duplicates.
 */

import { capabilityDispatcher } from '@/lib/orchestration/capabilities/dispatcher';
import { getRegisteredModules } from '@/lib/framework/modules/registry';
import { namespaceModuleCapability } from '@/lib/framework/modules/capabilities/namespace';

/** Register every registered module's capabilities into the dispatcher, namespaced. */
export function registerRegisteredModuleCapabilities(): void {
  for (const mod of getRegisteredModules()) {
    for (const capability of mod.capabilities ?? []) {
      capabilityDispatcher.register(namespaceModuleCapability(mod.slug, capability));
    }
  }
}

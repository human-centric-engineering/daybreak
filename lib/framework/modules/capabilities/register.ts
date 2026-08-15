/**
 * In-memory registration of module-declared capabilities into the global
 * dispatcher (f-module-bindings t-2, decision A8; v1.3 Phase 1 t-1.2).
 *
 * For every registered module, each declared capability is registered **as itself**
 * through the core seam (Sunrise #398): `register(capability, { slug, guard })` takes
 * the namespaced handler key and the module-scope guard, so no wrapper stands between
 * the dispatcher and the author's class. This is the *handler* half — the dispatcher
 * needs an in-memory `BaseCapability` to actually run a tool; the `ai_capability` DB
 * row (`sync.ts`) is the metadata half that lets an agent be granted it. Both derive
 * the same identity from `namespace.ts`.
 *
 * **Runs from `syncFramework()`, not `initFramework()`.** Boot order is
 * `initFramework() → initLeafApp() → syncFramework()`, and the leaf's modules are
 * registered in `initLeafApp()` — so at `initFramework()` time there is nothing to
 * read. `syncFramework()` is the first point after every tier has registered.
 *
 * Idempotent: the dispatcher keys handlers by slug, so a repeat (HMR, double boot)
 * replaces rather than duplicates.
 *
 * **One bad capability cannot dark the framework.** Registration is per-capability
 * fail-soft: a capability core refuses — a non-snake_case tool slug, or `processesPii`
 * without an own-prototype `redactProvenance()` — is logged as an error and skipped, and
 * its siblings still register. This is deliberate, and it is not "swallow the error": the
 * throw used to escape into `syncFramework()`, whose caller (`lib/app/bootstrap.ts`)
 * catches and logs, so **every later boot step was skipped** — framework capability
 * handlers, the module/slot syncs, the capability sync — leaving an app that serves
 * traffic looking healthy with no framework capabilities at all. One author's broken tool
 * is not a reason to unregister everyone else's. The capability is absent and loudly
 * logged; `sync.ts` then declines to write its `ai_capability` row, so nothing advertises
 * a tool that cannot dispatch.
 */

import { capabilityDispatcher } from '@/lib/orchestration/capabilities/dispatcher';
import { logger } from '@/lib/logging';
import { getRegisteredModules } from '@/lib/framework/modules/registry';
import {
  moduleCapabilityIdentity,
  moduleScopeGuard,
} from '@/lib/framework/modules/capabilities/namespace';

/** Register every registered module's capabilities into the dispatcher, namespaced.
 *  A capability the identity derivation or the dispatcher rejects is skipped and logged,
 *  not thrown (see the header). */
export function registerRegisteredModuleCapabilities(): void {
  for (const mod of getRegisteredModules()) {
    for (const capability of mod.capabilities ?? []) {
      try {
        const { slug } = moduleCapabilityIdentity(mod.slug, capability);
        // The real instance, not a wrapper — so the dispatcher's own PII guard inspects
        // the author's prototype (see the namespace.ts header) and an out-of-module call
        // is refused before the rate limiter rather than inside `execute()`.
        capabilityDispatcher.register(capability, { slug, guard: moduleScopeGuard(mod.slug) });
      } catch (err) {
        // `error`, not `warn`: the capability is gone for this boot and an operator has to
        // act. The message is the author's own contract violation, safe to surface.
        logger.error('registerRegisteredModuleCapabilities: capability rejected — skipping', {
          moduleSlug: mod.slug,
          capabilitySlug: capability.slug,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

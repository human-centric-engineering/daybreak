/**
 * Framework built-in capability registry (f-slot-capture t-1) — the generic seam for
 * registering **non-module, framework-owned** agent capabilities into the orchestration
 * dispatcher.
 *
 * The shipped capability paths are (a) Sunrise's own built-ins (hand-listed in
 * `orchestration/capabilities/registry.ts`), (b) the leaf app's (`registerAppCapability`),
 * and (c) **module-declared** tools (`modules/capabilities/*`, namespaced `<module>__<tool>`).
 * `get_state` / `fill_slot` — and, later, `f-guidance`'s tools — are none of these: they
 * are global framework tools owned by no module. This registry is their home: a feature
 * calls `registerFrameworkCapability(new X())`; the boot passes below flush the in-memory
 * handler (`registerFrameworkCapabilityHandlers`) and — in `sync.ts` — the `ai_capability`
 * metadata row. It is the framework-tier counterpart to the leaf's `registerAppCapability`.
 *
 * Pure (no DB): the list + the dispatcher handoff. The `ai_capability` row sync lives in
 * `sync.ts` (B12 — pure/DB split).
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { capabilityDispatcher } from '@/lib/orchestration/capabilities/dispatcher';
import { logger } from '@/lib/logging';

const frameworkCapabilities = new Map<string, BaseCapability>();

/**
 * Register a framework built-in capability. Deduped by slug (last wins, logged) and
 * idempotent, so a double boot / HMR replaces rather than duplicates. Called at
 * `initFramework()` time — these tools are framework-owned and do not depend on the
 * leaf's modules.
 */
export function registerFrameworkCapability(capability: BaseCapability): void {
  if (frameworkCapabilities.has(capability.slug)) {
    logger.warn('registerFrameworkCapability: duplicate slug — last registration wins', {
      slug: capability.slug,
    });
  }
  frameworkCapabilities.set(capability.slug, capability);
}

/** Every registered framework built-in capability, in registration order. */
export function getRegisteredFrameworkCapabilities(): BaseCapability[] {
  return [...frameworkCapabilities.values()];
}

/**
 * In-memory pass: register each framework capability's **handler** into the dispatcher
 * (what the dispatcher runs; the `ai_capability` row that lets an agent be *granted* it
 * is `syncFrameworkCapabilities`'s metadata half). Idempotent — the dispatcher keys by
 * slug. Runs before the DB sync so a transient boot-time DB error can't strand the
 * handlers (matching the module register-before-sync ordering).
 */
export function registerFrameworkCapabilityHandlers(): void {
  for (const capability of frameworkCapabilities.values()) {
    capabilityDispatcher.register(capability);
  }
}

/** Test-only: clear the registry so each test starts from a known state. */
export function __resetFrameworkCapabilitiesForTests(): void {
  frameworkCapabilities.clear();
}

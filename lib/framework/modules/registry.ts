/**
 * Module registry — the in-memory set of registered `ModuleDefinition`s.
 *
 * Pure and DB-free: `registerModule()` records a definition in a module-scoped
 * `Map` keyed by slug; the boot-time reconciliation of that map into
 * `framework_module` rows is `syncRegisteredModules()` (see `./sync`), kept a
 * separate function so registration stays synchronous, side-effect-light, and
 * unit-testable on its own.
 *
 * Registration happens in code at module-import time:
 *   - the framework registers its own modules (if any) from within `initFramework()`;
 *   - a leaf app registers its modules from `initLeafApp()` (the single leaf boot
 *     hook), calling `registerModule()` exported here.
 * The boot sequence (`lib/app/bootstrap.ts`) runs both before `syncFramework()`.
 *
 * Idempotent by slug — re-registering the same slug replaces the prior definition
 * — so repeated imports under HMR or multiple entrypoints are safe. Mirrors the
 * per-slug `Map` used by the capability schema registry
 * (`lib/orchestration/schemas/registry.ts`) and the capability dispatcher.
 */

import type { ModuleDefinition } from '@/lib/framework/modules/definition';

const modules = new Map<string, ModuleDefinition>();

/**
 * Register a module definition. Idempotent by slug: a later registration of the
 * same slug replaces the earlier one (HMR / repeat-import safe). Call at
 * module-import time, before the boot-time sync.
 */
export function registerModule(definition: ModuleDefinition): void {
  modules.set(definition.slug, definition);
}

/** All currently-registered module definitions, in insertion order. */
export function getRegisteredModules(): ModuleDefinition[] {
  return [...modules.values()];
}

/**
 * Test-only: clear the registry so each test starts from a known-empty state.
 * Not exported from the domain barrel (`./index`).
 */
export function __resetModuleRegistryForTests(): void {
  modules.clear();
}

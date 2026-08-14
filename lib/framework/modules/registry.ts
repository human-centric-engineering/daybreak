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
 *
 * # Why the store is on `globalThis` (#160)
 *
 * Next 16 + Turbopack loads `instrumentation.ts` in a SEPARATE module graph from
 * route handlers and RSC, so a plain module-scoped `Map` is a different object in
 * each graph. Registration happens only at boot — `instrumentation.ts` →
 * `initApp()` → `initFramework()` / `initLeafApp()` → `registerModule()` — so a
 * module-scoped map is populated in the instrumentation graph and **empty on
 * every request**. It fails silently and looks like a data problem: a correctly
 * registered, active, DB-synced module renders "This module's code is no longer
 * registered, so its config can't be edited", because `getRegisteredModule()`
 * returned `undefined` rather than throwing.
 *
 * Backing the store with `globalThis` makes one registry visible to every graph,
 * exactly as `lib/db/client.ts` does for the Prisma client and as Sunrise's own
 * #462 sweep did for the chat context contributors (`chat/context-builder.ts`)
 * and the capability dispatcher. That sweep predates this registry, which is why
 * it was missed. It also means registrations survive a dev hot-reload.
 *
 * Unlike `lib/db/client.ts`, this is NOT gated on `NODE_ENV !== 'production'`:
 * the realm split is a production code-path, not a dev-reload convenience.
 */

import type { ModuleDefinition } from '@/lib/framework/modules/definition';

const globalForModuleRegistry = globalThis as unknown as {
  daybreakFrameworkModuleRegistry?: Map<string, ModuleDefinition>;
};

const modules: Map<string, ModuleDefinition> =
  (globalForModuleRegistry.daybreakFrameworkModuleRegistry ??= new Map<string, ModuleDefinition>());

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
 * The registered definition for a slug, or `undefined` if no module with that slug is
 * registered in code (e.g. a retired `framework_module` row whose code was removed).
 * The source of a module's `configSchema` for validation + form rendering
 * (f-module-config).
 */
export function getRegisteredModule(slug: string): ModuleDefinition | undefined {
  return modules.get(slug);
}

/**
 * Test-only: clear the registry so each test starts from a known-empty state.
 * Not exported from the domain barrel (`./index`).
 */
export function __resetModuleRegistryForTests(): void {
  modules.clear();
}

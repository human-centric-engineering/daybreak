/**
 * Module capabilities (f-module-bindings t-2, A8) — a module's declared
 * `BaseCapability`s made live in the one global registry, namespaced
 * `<module-slug>.<tool>` and scope-aware. `register.ts` wires the in-memory
 * dispatcher handler; `sync.ts` reconciles the `ai_capability` metadata row;
 * `namespace.ts` derives the namespaced slug / provider-legal function name and the
 * module-scope guard — pure derivations handed to the core `register(cap, { slug,
 * guard })` seam, no wrapper. Both registration halves run from `syncFramework()`.
 */

export {
  moduleCapabilityIdentity,
  moduleCapabilitySlug,
  moduleScopeGuard,
  isInModuleScope,
} from '@/lib/framework/modules/capabilities/namespace';
export type { ModuleCapabilityIdentity } from '@/lib/framework/modules/capabilities/namespace';
export { registerRegisteredModuleCapabilities } from '@/lib/framework/modules/capabilities/register';
export {
  syncRegisteredModuleCapabilities,
  collectRegisteredModuleCapabilities,
} from '@/lib/framework/modules/capabilities/sync';

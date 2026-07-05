/**
 * Module capabilities (f-module-bindings t-2, A8) — a module's declared
 * `BaseCapability`s made live in the one global registry, namespaced
 * `<module-slug>.<tool>` and scope-aware. `register.ts` wires the in-memory
 * dispatcher handler; `sync.ts` reconciles the `ai_capability` metadata row;
 * `namespace.ts` derives the namespaced slug / provider-legal function name and
 * the scope-refusal wrapper. Both registration halves run from `syncFramework()`.
 */

export {
  namespaceModuleCapability,
  moduleCapabilitySlug,
  isInModuleScope,
} from '@/lib/framework/modules/capabilities/namespace';
export { registerRegisteredModuleCapabilities } from '@/lib/framework/modules/capabilities/register';
export {
  syncRegisteredModuleCapabilities,
  collectRegisteredModuleCapabilities,
} from '@/lib/framework/modules/capabilities/sync';

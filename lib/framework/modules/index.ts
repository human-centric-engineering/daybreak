/**
 * Modules domain — registered, bounded feature units: definition + registry,
 * generic config, agent/workflow/knowledge bindings, and engagement stats.
 *
 * `f-module-core` populates the code-first spine: the `ModuleDefinition` type, the
 * `registerModule()` seam + registry, and the boot-time `framework_module` sync.
 * Config (06), bindings (07), and engagement (08) land in their own features.
 * See `.context/framework/planning/f-module-core.md` and the spec §4.
 */

export type { ModuleDefinition } from '@/lib/framework/modules/definition';
export { registerModule, getRegisteredModules } from '@/lib/framework/modules/registry';
export { syncRegisteredModules } from '@/lib/framework/modules/sync';
export { MODULE_STATUS } from '@/lib/framework/modules/status';
export type { ModuleStatus } from '@/lib/framework/modules/status';
export { isModuleLive } from '@/lib/framework/modules/liveness';
export type {
  ModuleLivenessFields,
  ModuleLockReason,
  ModuleLiveness,
} from '@/lib/framework/modules/liveness';

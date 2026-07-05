/**
 * Modules domain — registered, bounded feature units: definition + registry,
 * generic config, agent/workflow/knowledge bindings, and engagement stats.
 *
 * `f-module-core` populates the code-first spine: the `ModuleDefinition` type, the
 * `registerModule()` seam + registry, and the boot-time `framework_module` sync.
 * `f-module-bindings` (07) adds the agent-binding surface (t-1, below); config (06),
 * workflow/knowledge bindings (07 t-3/t-4), and engagement (08) land in turn.
 * See `.context/framework/planning/f-module-core.md` and the spec §4.
 */

export type { ModuleDefinition } from '@/lib/framework/modules/definition';
export { registerModule, getRegisteredModules } from '@/lib/framework/modules/registry';
export { syncRegisteredModules } from '@/lib/framework/modules/sync';
export { listModules } from '@/lib/framework/modules/queries';
export { MODULE_STATUS } from '@/lib/framework/modules/status';
export type { ModuleStatus } from '@/lib/framework/modules/status';
export { isModuleLive } from '@/lib/framework/modules/liveness';
export type {
  ModuleLivenessFields,
  ModuleLockReason,
  ModuleLiveness,
} from '@/lib/framework/modules/liveness';
export {
  bindAgent,
  updateBinding,
  unbindAgent,
  listModuleBindings,
  type BindAgentArgs,
  type UpdateBindingArgs,
  type UnbindAgentArgs,
  type ModuleAgentBindingView,
} from '@/lib/framework/modules/bindings';

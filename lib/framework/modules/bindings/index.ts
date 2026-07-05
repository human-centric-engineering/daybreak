/**
 * Module agent bindings (f-module-bindings t-1) — bind an `AiAgent` into a module
 * seat (spec §4.2, A6). Writes go through `./service` (the sole writer), reads
 * through `./queries` (which stitch the agent's display fields). Request schemas in
 * `./api-schemas`. Workflow (t-3) and knowledge (t-4) bindings are sibling folders.
 */

export {
  bindAgent,
  updateBinding,
  unbindAgent,
  type BindAgentArgs,
  type UpdateBindingArgs,
  type UnbindAgentArgs,
} from '@/lib/framework/modules/bindings/service';
export {
  listModuleBindings,
  type ModuleAgentBindingView,
} from '@/lib/framework/modules/bindings/queries';

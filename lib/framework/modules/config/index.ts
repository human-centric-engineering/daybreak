/**
 * Module config domain (f-module-config) — validate an operator's module config against
 * the module's own Zod schema (A4) and version every save via a `ModuleVersion` snapshot
 * (A10). t-1 ships the versioning service; t-2 adds the schema→descriptor walker, the
 * config read side, and the admin API. See `.context/framework/planning/f-module-config.md`
 * and spec §4.1.
 */

export {
  saveModuleConfig,
  restoreModuleVersion,
  listModuleVersions,
  getModuleVersion,
  type SaveModuleConfigArgs,
  type SaveModuleConfigResult,
  type RestoreModuleVersionArgs,
  type ListModuleVersionsOptions,
  type ListModuleVersionsResult,
} from '@/lib/framework/modules/config/version-service';

export {
  describeConfigSchema,
  type FieldDescriptor,
} from '@/lib/framework/modules/config/schema-descriptors';
export { getModuleConfigForm, type ModuleConfigForm } from '@/lib/framework/modules/config/queries';

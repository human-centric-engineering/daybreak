/**
 * Module knowledge scope (f-module-bindings t-4) — a module owns a durable set of
 * knowledge documents/tags (spec §4.2, "no new mechanism at all"); its bound agents
 * inherit search access, unioned live by the core access-contributor seam. Writes go
 * through `./service` (the sole writer), reads through `./queries`, the live
 * agent-scope computation through `./contributor` (registered into core from the
 * framework boot path). Request schemas in `./api-schemas`. Sibling of the agent (t-1)
 * and workflow (t-3) bindings.
 */

export {
  grantModuleDocument,
  revokeModuleDocument,
  grantModuleTag,
  revokeModuleTag,
  type GrantModuleDocumentArgs,
  type RevokeModuleDocumentArgs,
  type GrantModuleTagArgs,
  type RevokeModuleTagArgs,
} from '@/lib/framework/modules/knowledge/service';
export {
  listModuleKnowledge,
  type ModuleKnowledgeScope,
  type ModuleKnowledgeDocumentView,
  type ModuleKnowledgeTagView,
} from '@/lib/framework/modules/knowledge/queries';
export {
  resolveModuleKnowledgeForAgent,
  MODULE_KNOWLEDGE_CONTRIBUTOR_KEY,
} from '@/lib/framework/modules/knowledge/contributor';

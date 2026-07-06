/**
 * Module knowledge access contributor (f-module-bindings t-4).
 *
 * The framework's registration into the core `registerAgentAccessContributor` seam:
 * given an agent, return the documents and tags contributed by the modules the agent
 * is bound to. Computed LIVE at resolve time from `ModuleAgentBinding` ⋈ the module
 * knowledge-scope pivots — nothing is materialised onto the agent, so a newly-bound
 * agent inherits the scope on its next search, an unbound agent loses it immediately,
 * and the operator's direct grants on the same agent are never touched.
 *
 * The core resolver only consults this for a *restricted* agent (a `full` agent
 * already searches everything) and only ever UNIONS the result in — module scope
 * widens a restricted agent's reach, never narrows it. See
 * `lib/orchestration/knowledge/agent-access-contributors.ts`.
 */

import { prisma } from '@/lib/db/client';
import type { AgentAccessContribution } from '@/lib/orchestration/knowledge/agent-access-contributors';

/** Registry key for the module knowledge contributor (idempotent re-registration). */
export const MODULE_KNOWLEDGE_CONTRIBUTOR_KEY = 'framework:module-knowledge';

/**
 * The documents and tags an agent may search by virtue of the modules it is bound to:
 * the union of every bound module's knowledge scope. Empty when the agent is bound to
 * no module (or none of its modules grant knowledge).
 */
export async function resolveModuleKnowledgeForAgent(
  agentId: string
): Promise<AgentAccessContribution> {
  const bindings = await prisma.moduleAgentBinding.findMany({
    where: { agentId },
    select: { moduleId: true },
  });
  const moduleIds = [...new Set(bindings.map((b) => b.moduleId))];
  if (moduleIds.length === 0) return {};

  const [docs, tags] = await Promise.all([
    prisma.moduleKnowledgeDocument.findMany({
      where: { moduleId: { in: moduleIds } },
      select: { documentId: true },
    }),
    prisma.moduleKnowledgeTag.findMany({
      where: { moduleId: { in: moduleIds } },
      select: { tagId: true },
    }),
  ]);

  return {
    documentIds: [...new Set(docs.map((d) => d.documentId))],
    tagIds: [...new Set(tags.map((t) => t.tagId))],
  };
}

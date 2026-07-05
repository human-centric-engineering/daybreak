/**
 * Module agent-binding read queries (f-module-bindings t-1) — the read side of
 * `framework_module_agent`, split from the writer (`./service`) the way f-map split
 * `queries.ts` from its version service.
 *
 * `ModuleAgentBinding.agentId` has no Prisma relation (the X6 boundary keeps a
 * reverse field off the core `AiAgent` model), so `include: { agent }` is not
 * available — the agent's display fields are STITCHED with one batched follow-up
 * query keyed on the collected agent ids (no per-row fetch, no N+1).
 */

import type { ModuleAgentBinding } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';

/** A binding enriched with the bound agent's display fields (or `null` if gone). */
export interface ModuleAgentBindingView extends ModuleAgentBinding {
  agent: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    /**
     * Tombstone marker: non-null ⇒ the agent was soft-deleted after being bound
     * (its slug is now `-deleted-{id}`). Surfaced so a consumer can distinguish a
     * *tombstoned* agent from a merely-*deactivated* one (`isActive: false`,
     * `deletedAt: null`) without re-querying `AiAgent` — the runtime resolver
     * (f-guidance) must filter these per the `AiAgent` read-path contract.
     */
    deletedAt: Date | null;
  } | null;
}

/**
 * List a module's agent bindings, primary seat first then by role, each stitched
 * with the bound agent's display fields. A soft-deleted (tombstoned) agent still
 * resolves (with `deletedAt` set) so a stale binding is visible for cleanup rather
 * than silently dropped; a hard-deleted agent's binding is already gone via the FK
 * cascade. Unknown module ⇒ 404 (not an empty list).
 */
export async function listModuleBindings(moduleSlug: string): Promise<ModuleAgentBindingView[]> {
  const moduleRow = await prisma.module.findUnique({
    where: { slug: moduleSlug },
    select: { id: true },
  });
  if (!moduleRow) throw new NotFoundError(`Module "${moduleSlug}" not found`);

  const bindings = await prisma.moduleAgentBinding.findMany({
    where: { moduleId: moduleRow.id },
    orderBy: [{ isPrimary: 'desc' }, { role: 'asc' }],
  });
  if (bindings.length === 0) return [];

  const agentIds = [...new Set(bindings.map((b) => b.agentId))];
  const agents = await prisma.aiAgent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, slug: true, isActive: true, deletedAt: true },
  });
  const byId = new Map(agents.map((a) => [a.id, a]));

  return bindings.map((b) => ({ ...b, agent: byId.get(b.agentId) ?? null }));
}

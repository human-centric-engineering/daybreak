/**
 * Agent knowledge-access contributor registry.
 *
 * A generic extension seam for `resolveAgentDocumentAccess`: any subsystem can
 * register a contributor that, given an `agentId`, returns extra documents and/or
 * tags the agent may search. The resolver unions every contributor's output into a
 * **restricted** agent's effective document set.
 *
 * Contributors only ever **widen** access — a `full`-mode agent already searches the
 * whole knowledge base, so contributors are not consulted for it; they can never
 * narrow an agent's access. Each contribution is an independent, live source
 * (computed at resolve time, never materialised), so overlapping grants across
 * sources never conflict.
 *
 * Keyed by a string id so a repeated registration (e.g. a re-run boot hook) replaces
 * rather than duplicates. Contributors run on the resolver's cached hot path, so keep
 * them cheap; a subsystem that changes the data a contributor reads MUST invalidate
 * the affected agents via `invalidateAgentAccess(agentId)` (the resolver caches the
 * composed result, contributor output included).
 *
 * This is the same shape as `registerContextContributor` — core owns the registry;
 * extensions register into it in the allowed inbound direction, so no core code ever
 * references a specific extension. An empty registry reproduces the resolver's prior
 * behaviour exactly.
 */

export interface AgentAccessContribution {
  /** Document ids to add to the restricted agent's searchable set. */
  documentIds?: string[];
  /** Tag ids to add — expanded to their documents by the resolver, like a tag grant. */
  tagIds?: string[];
}

export type AgentAccessContributor = (agentId: string) => Promise<AgentAccessContribution>;

const contributors = new Map<string, AgentAccessContributor>();

/**
 * Register (or replace, by `key`) a contributor consulted for every restricted agent.
 * Idempotent per key so a double boot is harmless.
 */
export function registerAgentAccessContributor(
  key: string,
  contributor: AgentAccessContributor
): void {
  contributors.set(key, contributor);
}

/** The registered contributors, in registration order. */
export function getAgentAccessContributors(): AgentAccessContributor[] {
  return Array.from(contributors.values());
}

/** Test-only: drop all registered contributors. */
export function __resetAgentAccessContributorsForTests(): void {
  contributors.clear();
}

/**
 * Relevance/maturity gating (f-policies t-2, spec §5.5 F14) — the first ENFORCED policy kind.
 * "Which agent groupings matter most depends on how far the user has matured": a `relevance_gating`
 * policy restricts which facilitation roles a user may reach, given where they are in a map.
 *
 * Enforced at `resolveFacilitationSurface` (the single role→agent choke point f-facilitation-agents
 * shipped): a role a policy excludes yields no surface (→ 404), the same as an unbound seat. The
 * gate is **fail-open** — with no applicable policy, every role is allowed; a policy only ever
 * NARROWS. Policies are GRAPH-SCOPED (each carries a `graphSlug`), because "maturity" is a
 * per-journey notion the deployment-wide facilitation surface doesn't otherwise carry; the gate
 * derives the user's current position in each referenced graph via the guidance assembler.
 */

import type { UserNodeState } from '@prisma/client';
import type { GraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import type { JourneyViewer } from '@/lib/framework/shared/access';
import { assembleJourneyContext } from '@/lib/framework/guidance/assemble';
import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import {
  relevanceGatingPayloadSchema,
  type RelevanceGatingPayload,
} from '@/lib/framework/facilitation/policies/kinds';
import { logger } from '@/lib/logging';

/** A user's current authored position in a graph — the stage/region a gate matches against. */
export interface CurrentPosition {
  stage?: string;
  region?: string;
}

/**
 * Derive the user's CURRENT authored stage/region from their node states — the position a
 * relevance gate matches. "Current" = the node they are actively at (`active`), else the
 * most-recently-touched node they've reached (`visited`/`completed`), mapped to its authored
 * `stage`/`region`. Returns `{}` when the user has reached no such node (e.g. everything still
 * `available`) — a position-specific policy then simply doesn't apply (fail-open), while an
 * empty-`match` whole-graph policy still does.
 */
export function deriveCurrentStageRegion(
  nodeStates: readonly UserNodeState[],
  graph: GraphStore
): CurrentPosition {
  const reached = nodeStates.filter(
    (s) => s.status === 'active' || s.status === 'visited' || s.status === 'completed'
  );
  if (reached.length === 0) return {};

  // `active` outranks a merely-reached node; within a rank, most-recently-active wins.
  const rank = (s: UserNodeState): number => (s.status === 'active' ? 1 : 0);
  const recencyOf = (s: UserNodeState): number =>
    (s.lastActiveAt ?? s.firstEnteredAt ?? s.completedAt ?? new Date(0)).getTime();
  const current = reached.reduce((best, s) => {
    const byRank = rank(s) - rank(best);
    if (byRank !== 0) return byRank > 0 ? s : best;
    return recencyOf(s) > recencyOf(best) ? s : best;
  });

  const node = graph.node(current.nodeKey);
  return { stage: node?.stage, region: node?.region };
}

/** Whether the user's derived position satisfies a policy's `match` (an empty match = always). */
function positionMatchesGate(
  pos: CurrentPosition,
  match: RelevanceGatingPayload['match']
): boolean {
  if (match.stage !== undefined && pos.stage !== match.stage) return false;
  if (match.region !== undefined && pos.region !== match.region) return false;
  return true;
}

/**
 * May `userId` open a facilitation surface for `role`, given the relevance-gating policies? Loads
 * the enabled `relevance_gating` policies, groups them by graph (so each graph is assembled once),
 * derives the user's position per graph, and DENIES if any applicable policy's `allowedRoles`
 * omits the role. Fail-open: no policies, or none applicable, ⇒ allowed.
 */
export async function isRoleAllowedAtStage(userId: string, role: string): Promise<boolean> {
  const policies = await listEnabledFacilitationPolicies('relevance_gating');
  if (policies.length === 0) return true; // no gating configured

  // A policy row's payload was validated for its kind at write time; re-parse defensively (never
  // trust stored JSON without Zod — CLAUDE.md), grouping by graph to assemble each graph once.
  const byGraph = new Map<string, RelevanceGatingPayload[]>();
  for (const policy of policies) {
    const parsed = relevanceGatingPayloadSchema.safeParse(policy.payload);
    if (!parsed.success) {
      logger.warn('Skipping malformed relevance_gating policy', { policyId: policy.id });
      continue;
    }
    const list = byGraph.get(parsed.data.graphSlug) ?? [];
    list.push(parsed.data);
    byGraph.set(parsed.data.graphSlug, list);
  }

  const viewer: JourneyViewer = { userId };
  for (const [graphSlug, payloads] of byGraph) {
    // The user IS the subject, so this canRead-guarded assembly is always permitted. `null` = no
    // published graph or the user hasn't started this journey → the policy can't apply (fail-open).
    const context = await assembleJourneyContext(viewer, { userId, graphSlug });
    if (context === null) continue;

    const pos = deriveCurrentStageRegion(context.nodeStates, context.availabilityInput.graph);
    for (const payload of payloads) {
      if (!positionMatchesGate(pos, payload.match)) continue;
      // `allowedRoles` is a validated FacilitationRole[]; widen to compare with the requested role.
      const allowed: readonly string[] = payload.allowedRoles;
      if (!allowed.includes(role)) return false; // applicable + not allowed → deny
    }
  }

  return true;
}

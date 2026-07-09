/**
 * Request validation schemas for the structure-change proposal admin API (f-emergence t-3).
 *
 * Framework-tier; the `/api/v1/admin/framework/facilitation/proposals/**` routes are the only
 * consumers. `proposedDefinition` is `z.unknown()` here — the subject's own validator (the map
 * publish gate / the module-config schema / the policy validator, via the pipeline) is the real
 * validator, run in the service, so a bad definition is a service-level `ValidationError` (→ 400).
 * `subjectType` is the widened vocabulary (`map` | `module_config` | `policy`, f-governance-plus t-1).
 */

import { z } from 'zod';
import { parseCuidParam } from '@/lib/framework/shared/route-params';
import { PROPOSAL_SUBJECT_TYPES } from '@/lib/framework/facilitation/emergence/pipeline';

/** POST /proposals — submit a proposal. `subjectId` names the existing target (a map/graph slug, a
 *  module slug, or a policy id); `proposedDefinition` is the new content. `authorAgentSlug` (if given)
 *  records agent authorship (`createdBy = "agent:<slug>"`); otherwise the session admin is the author. */
export const submitProposalBodySchema = z.object({
  subjectType: z.enum(PROPOSAL_SUBJECT_TYPES),
  subjectId: z.string().min(1).max(200),
  proposedDefinition: z.unknown(),
  authorAgentSlug: z.string().min(1).max(200).optional(),
});

/** POST /proposals/[id]/reject — a required, non-empty reason. */
export const rejectProposalBodySchema = z.object({
  reason: z.string().min(1).max(2000),
});

/** Validate a `[proposalId]` path param (a cuid); malformed ⇒ 400, not 404. */
export function parseProposalId(raw: string): string {
  return parseCuidParam(raw, 'proposal', 'proposalId');
}

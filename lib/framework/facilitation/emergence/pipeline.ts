/**
 * Structure-change proposal validation pipeline (f-emergence t-2, spec §5.5 F17; subjects widened in
 * f-governance-plus t-1) — the subject-typed front of the emergence gate. It validates a proposed
 * change and resolves what it targets BEFORE the change is stored as a pending proposal, so the
 * deterministic spine is never written raw.
 *
 * Three subjects, each reusing the write-service that already owns its shape:
 *  - `map` — reuse the map's own publish gate (`validatePublishableMap`: Zod shape → referential
 *    format → engine invariants, the identical stage f-engine built standalone/callable for F17) and
 *    resolve the base published version for later conflict detection.
 *  - `module_config` — reuse the module-config schema contract (`validateModuleConfig`, the walker
 *    behind `saveModuleConfig`) and capture the module's current version as the conflict base.
 *  - `policy` — resolve the target policy by id, validate the proposed payload against its (immutable)
 *    kind (`assertValidFacilitationPolicy`); last-writer-wins (`baseVersion: null` — a policy has no
 *    version spine, and approval overwrites the existing row in place).
 *
 * The convention across subjects — always a change to an EXISTING target, never a create: `subjectId`
 * NAMES the target (a map/graph slug, a module slug, or a policy id) and `proposedDefinition` is the
 * new content (a map definition, a config value, or a policy payload). Throws `ValidationError` (bad
 * definition / unsupported subject) or `NotFoundError` (unknown map / module / policy).
 *
 * Risk classification is a **stub** (`'unclassified'`): the auto-approve risk taxonomy is deferred
 * (§9.2, empirical), and the shipped `autoApprove: none` means every proposal needs human approval
 * regardless — the classifier is the seam a later `low_risk` taxonomy plugs into.
 */

import type { Prisma } from '@prisma/client';
import { validatePublishableMap } from '@/lib/framework/facilitation/map/version-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import {
  validateModuleConfig,
  getLatestModuleVersionNumber,
} from '@/lib/framework/modules/config/version-service';
import { assertValidFacilitationPolicy } from '@/lib/framework/facilitation/policies/kinds';
import { getFacilitationPolicy } from '@/lib/framework/facilitation/policies/policy-queries';
import { ValidationError } from '@/lib/api/errors';

/** The proposal subjects. `map` (f-emergence) + `module_config` / `policy` (f-governance-plus t-1). */
export const PROPOSAL_SUBJECT_TYPES = ['map', 'module_config', 'policy'] as const;
export type ProposalSubjectType = (typeof PROPOSAL_SUBJECT_TYPES)[number];

export interface ValidatedProposal {
  /** The validated, normalized definition (Zod defaults applied) to store + later apply. */
  definition: Prisma.InputJsonValue;
  /** The base the proposal was made against (map version / module version), or `null`. */
  baseVersion: number | null;
  /** Risk classification (stubbed `'unclassified'` in v1 — see the module header). */
  riskClass: string;
}

/**
 * Validate a proposed structure change and resolve its target, dispatching on the subject. Each
 * branch reuses the write-service that owns the subject's shape (see the module header).
 */
export async function validateProposal(
  subjectType: ProposalSubjectType,
  subjectId: string,
  proposedDefinition: unknown
): Promise<ValidatedProposal> {
  if (subjectType === 'map') return validateMapProposal(subjectId, proposedDefinition);
  if (subjectType === 'module_config') {
    return validateModuleConfigProposal(subjectId, proposedDefinition);
  }
  if (subjectType === 'policy') return validatePolicyProposal(subjectId, proposedDefinition);

  // Defensive: unreachable for typed callers (the API schema + capability constrain the enum), but a
  // guard for any untyped caller so a bad subject is a clean ValidationError, not a silent no-op.
  throw new ValidationError('Unsupported structure-change proposal subject', {
    subjectType: [`Unsupported subject type "${String(subjectType)}"`],
  });
}

/** `map` — run the publish gate over the definition and read the current published version as base. */
async function validateMapProposal(
  subjectId: string,
  proposedDefinition: unknown
): Promise<ValidatedProposal> {
  const definition = validatePublishableMap(proposedDefinition);
  const graph = await getGraphDetail(subjectId); // throws NotFoundError if absent
  const baseVersion = graph.publishedVersion?.version ?? null;
  return {
    definition: definition as Prisma.InputJsonValue,
    baseVersion,
    riskClass: 'unclassified',
  };
}

/** `module_config` — validate against the module's schema and capture its live version as base. */
async function validateModuleConfigProposal(
  subjectId: string,
  proposedDefinition: unknown
): Promise<ValidatedProposal> {
  const definition = validateModuleConfig(subjectId, proposedDefinition); // throws if unregistered/invalid
  const baseVersion = await getLatestModuleVersionNumber(subjectId); // throws NotFoundError if unknown
  return { definition, baseVersion, riskClass: 'unclassified' };
}

/** `policy` — resolve the target policy by id, validate the payload against its kind; no base. */
async function validatePolicyProposal(
  subjectId: string,
  proposedDefinition: unknown
): Promise<ValidatedProposal> {
  const policy = await getFacilitationPolicy(subjectId); // throws NotFoundError if the policy is gone
  const valid = assertValidFacilitationPolicy(policy.kind, proposedDefinition);
  return { definition: valid.payload, baseVersion: null, riskClass: 'unclassified' };
}

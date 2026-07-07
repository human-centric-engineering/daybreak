/**
 * Structure-change proposal validation pipeline (f-emergence t-2, spec §5.5 F17) — the subject-typed
 * front of the emergence gate. It validates a proposed change and resolves what it targets BEFORE
 * the change is stored as a pending proposal, so the deterministic spine is never written raw.
 *
 * v1 handles the MAP subject only: it reuses the map's own publish gate (`validatePublishableMap`:
 * Zod shape → referential format → engine invariants — the identical stage f-engine built
 * standalone/callable for F17) and resolves the base published version for later conflict detection.
 * Throws `ValidationError` (bad definition / unsupported subject) or `NotFoundError` (unknown map).
 *
 * Risk classification is a **stub** (`'unclassified'`): the auto-approve risk taxonomy is deferred
 * (§9.2, empirical), and the shipped `autoApprove: none` means every proposal needs human approval
 * regardless — the classifier is the seam a later `low_risk` taxonomy plugs into.
 */

import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import { validatePublishableMap } from '@/lib/framework/facilitation/map/version-service';
import { getGraphDetail } from '@/lib/framework/facilitation/map/queries';
import { ValidationError } from '@/lib/api/errors';

/** The proposal subjects. v1 = `map` only; `module_config` / `policy` are an additive later scope. */
export type ProposalSubjectType = 'map';

export interface ValidatedProposal {
  /** The validated, normalized map definition (Zod defaults applied) to store + later publish. */
  definition: MapDefinition;
  /** The published version the proposal was made against, or `null` if the map has none yet. */
  baseVersion: number | null;
  /** Risk classification (stubbed `'unclassified'` in v1 — see the module header). */
  riskClass: string;
}

/**
 * Validate a proposed structure change and resolve its target. For the `map` subject: run the
 * publish gate over `proposedDefinition`, confirm the target map exists, and read the current
 * published version as the diff's base.
 */
export async function validateProposal(
  subjectType: ProposalSubjectType,
  subjectId: string,
  proposedDefinition: unknown
): Promise<ValidatedProposal> {
  if (subjectType !== 'map') {
    // Defensive — the API schema constrains subjectType to 'map' in v1 (module_config/policy later).
    throw new ValidationError('Only "map" structure-change proposals are supported', {
      subjectType: ['Unsupported subject type'],
    });
  }

  // Reuse the map's publish gate: Zod shape → referential format → engine invariants (F17).
  const definition = validatePublishableMap(proposedDefinition);

  // Confirm the target map exists and resolve the base published version (for t-3 conflict detection).
  const graph = await getGraphDetail(subjectId); // throws NotFoundError if absent
  const baseVersion = graph.publishedVersion?.version ?? null;

  return { definition, baseVersion, riskClass: 'unclassified' };
}

/**
 * Auto-approval resolver (f-emergence t-3, spec §5.5 F17 / §9.2) — reads the `auto_approval` policy
 * knob that decides whether a structure-change proposal may bypass human sign-off.
 *
 * Ships `autoApprove: none` (every proposal needs human approval). The `low_risk` risk *taxonomy* —
 * which change classes are safe to auto-approve — is deferred (§9.2, empirical): a proposal's
 * `riskClass` is always `'unclassified'` today, which is never auto-approvable. So `isAutoApprovable`
 * returns `false` regardless of the resolved mode in v1; the seam is live and correct (when the
 * taxonomy lands and marks a proposal `low_risk` under a `low_risk` policy, it will auto-approve),
 * but inert. The submit path consults it, so nothing here is dead code.
 */

import { listEnabledFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { autoApprovalPayloadSchema } from '@/lib/framework/facilitation/policies/kinds';
import { logger } from '@/lib/logging';

export type AutoApproveMode = 'none' | 'low_risk';

/**
 * Resolve the effective auto-approval mode from the enabled `auto_approval` policies. **`none` is the
 * safe floor**: if ANY policy says `none` (or there is no policy, or all are malformed), the mode is
 * `none` — auto-approval requires that no enabled policy forbids it and at least one permits it.
 */
export async function getAutoApproveMode(): Promise<AutoApproveMode> {
  const policies = await listEnabledFacilitationPolicies('auto_approval');
  let sawLowRisk = false;
  for (const policy of policies) {
    const parsed = autoApprovalPayloadSchema.safeParse(policy.payload);
    if (!parsed.success) {
      logger.warn('Skipping malformed auto_approval policy', { policyId: policy.id });
      continue;
    }
    if (parsed.data.autoApprove === 'none') return 'none'; // any 'none' forces human approval
    if (parsed.data.autoApprove === 'low_risk') sawLowRisk = true;
  }
  return sawLowRisk ? 'low_risk' : 'none';
}

/**
 * Whether a proposal of `riskClass` may auto-approve under `mode`. In v1 the risk taxonomy is
 * deferred, so `riskClass` is always `'unclassified'` and this is always `false` — human approval is
 * required. When the taxonomy lands, a `'low_risk'` proposal under a `'low_risk'` mode auto-approves.
 */
export function isAutoApprovable(mode: AutoApproveMode, riskClass: string): boolean {
  return mode === 'low_risk' && riskClass === 'low_risk';
}

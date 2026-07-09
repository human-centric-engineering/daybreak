/**
 * Emergence capabilities (f-governance-plus t-2) — the agent tools over the structure-change
 * proposal gate. One write tool today: `submit_proposal`, which authors a pending proposal for
 * human approval (f-emergence shipped the pipeline human/API-authored only). Registered as a
 * framework built-in (via `registerFrameworkCapability`) from `initFramework()`; granted to the
 * `facilitator` seat the ordinary way (an `AiAgentCapability` binding — the seat is a documented
 * reference, not a code gate).
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { SubmitProposalCapability } from '@/lib/framework/facilitation/emergence/capabilities/submit-proposal';

export { SubmitProposalCapability } from '@/lib/framework/facilitation/emergence/capabilities/submit-proposal';

/** The emergence capabilities registered at boot — the proposal-authoring write tool. */
export const emergenceCapabilities: readonly BaseCapability[] = [new SubmitProposalCapability()];

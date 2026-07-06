/**
 * Guidance capabilities (f-guidance) — the agent tools over the guidance service. Read
 * (t-2): `get_journey_state`, `get_next_steps`, `get_progress_synopsis`, `suggest_focus`.
 * Write (t-3): `request_transition` (over the engine's sole writer `applyEvent`). All are
 * deterministic and consumed only by agents granted them (F12). Registered as framework
 * built-ins (via `registerFrameworkCapability`) from `initFramework()`.
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { GetJourneyStateCapability } from '@/lib/framework/guidance/capabilities/get-journey-state';
import { GetNextStepsCapability } from '@/lib/framework/guidance/capabilities/get-next-steps';
import { GetProgressSynopsisCapability } from '@/lib/framework/guidance/capabilities/get-progress-synopsis';
import { SuggestFocusCapability } from '@/lib/framework/guidance/capabilities/suggest-focus';
import { RequestTransitionCapability } from '@/lib/framework/guidance/capabilities/request-transition';

export { GetJourneyStateCapability } from '@/lib/framework/guidance/capabilities/get-journey-state';
export { GetNextStepsCapability } from '@/lib/framework/guidance/capabilities/get-next-steps';
export { GetProgressSynopsisCapability } from '@/lib/framework/guidance/capabilities/get-progress-synopsis';
export { SuggestFocusCapability } from '@/lib/framework/guidance/capabilities/suggest-focus';
export { RequestTransitionCapability } from '@/lib/framework/guidance/capabilities/request-transition';

/** The guidance capabilities registered at boot — four read tools + the write transition. */
export const guidanceCapabilities: readonly BaseCapability[] = [
  new GetJourneyStateCapability(),
  new GetNextStepsCapability(),
  new GetProgressSynopsisCapability(),
  new SuggestFocusCapability(),
  new RequestTransitionCapability(),
];

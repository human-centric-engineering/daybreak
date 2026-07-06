/**
 * Guidance read capabilities (f-guidance t-2) — the agent tools over the guidance service:
 * `get_journey_state`, `get_next_steps`, `get_progress_synopsis`, `suggest_focus`. All are
 * read-only, deterministic, and consumed only by agents granted them (F12). Registered as
 * framework built-ins (via `registerFrameworkCapability`) from `initFramework()`. The write
 * capability (`request_transition`) is t-3.
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { GetJourneyStateCapability } from '@/lib/framework/guidance/capabilities/get-journey-state';
import { GetNextStepsCapability } from '@/lib/framework/guidance/capabilities/get-next-steps';
import { GetProgressSynopsisCapability } from '@/lib/framework/guidance/capabilities/get-progress-synopsis';
import { SuggestFocusCapability } from '@/lib/framework/guidance/capabilities/suggest-focus';

export { GetJourneyStateCapability } from '@/lib/framework/guidance/capabilities/get-journey-state';
export { GetNextStepsCapability } from '@/lib/framework/guidance/capabilities/get-next-steps';
export { GetProgressSynopsisCapability } from '@/lib/framework/guidance/capabilities/get-progress-synopsis';
export { SuggestFocusCapability } from '@/lib/framework/guidance/capabilities/suggest-focus';

/** The guidance read capabilities registered at boot. */
export const guidanceCapabilities: readonly BaseCapability[] = [
  new GetJourneyStateCapability(),
  new GetNextStepsCapability(),
  new GetProgressSynopsisCapability(),
  new SuggestFocusCapability(),
];

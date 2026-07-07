/**
 * Engagement capabilities (f-engagement) — the agent tools over the engagement stream.
 * `record_feedback` (t-2): capture a user's module rating + comment as a `module.feedback`
 * event. Registered as framework built-ins (via `registerFrameworkCapability`) from
 * `initFramework()`, the same path as the data-slots and guidance capabilities.
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { RecordFeedbackCapability } from '@/lib/framework/engagement/capabilities/record-feedback';

export { RecordFeedbackCapability } from '@/lib/framework/engagement/capabilities/record-feedback';

/** The engagement capabilities registered at boot: `record_feedback`. */
export const engagementCapabilities: readonly BaseCapability[] = [new RecordFeedbackCapability()];

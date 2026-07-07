/**
 * Request validation schemas for the framework overlays admin API (f-overlays t-3). Framework-tier.
 */

import { z } from 'zod';

/**
 * POST /proactive-guidance — preview the proactive-guidance sweep. All fields optional (an empty body
 * uses the documented defaults), so callers can trigger it with no payload.
 */
export const proactiveSweepBodySchema = z.object({
  /** Days without a journey event before an active journey counts as stalled. */
  stalledDays: z.number().int().min(1).max(365).optional(),
  /** Cap on journeys scanned this sweep. */
  maxJourneys: z.number().int().min(1).max(1000).optional(),
});

export type ProactiveSweepBody = z.infer<typeof proactiveSweepBodySchema>;

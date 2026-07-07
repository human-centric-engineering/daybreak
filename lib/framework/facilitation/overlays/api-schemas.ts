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

/**
 * POST /proactive-guidance/deliver — run the sweep AND email the throttled nudges (t-3b). All fields
 * optional (empty body → defaults); `throttleDays` additionally guards re-nudging.
 */
export const deliverNudgesBodySchema = z.object({
  stalledDays: z.number().int().min(1).max(365).optional(),
  maxJourneys: z.number().int().min(1).max(1000).optional(),
  /** Don't re-nudge a journey nudged within this many days. */
  throttleDays: z.number().int().min(1).max(365).optional(),
});

export type DeliverNudgesBody = z.infer<typeof deliverNudgesBodySchema>;

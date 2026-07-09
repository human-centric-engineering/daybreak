/**
 * Proactive-nudge delivery channel config (f-governance-plus t-4, spec §5.4, F13) — resolves the
 * fork-owned env that selects where proactive nudges go. f-overlays shipped email-only; this adds an
 * env-gated outbound webhook alongside/instead of email, with no settings singleton or admin UI (a
 * backend-only feature deliberately avoids a UI surface — decision D). An admin-configurable
 * destination + true per-owner endpoints are deferred.
 *
 * Two fork-owned env vars (read here, not through Sunrise's `lib/env.ts` core schema nor the
 * leaf-reserved `lib/app/env.ts`):
 *   - `FRAMEWORK_NUDGE_CHANNEL` — `email` (default) | `webhook` | `both`.
 *   - `FRAMEWORK_NUDGE_WEBHOOK_URL` — the outbound POST destination (required for the webhook channels).
 *
 * A misconfigured `webhook` (no / invalid URL) FALLS BACK to email rather than silently dropping
 * nudges. `both` sends email AND webhook when the URL is valid.
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';

export const NUDGE_CHANNELS = ['email', 'webhook', 'both'] as const;
export type NudgeChannel = (typeof NUDGE_CHANNELS)[number];

export interface NudgeChannelConfig {
  /** Send the nudge email. */
  emailEnabled: boolean;
  /** POST the nudge to this URL, or `null` when the webhook channel is off / misconfigured. */
  webhookUrl: string | null;
}

/**
 * Resolve the nudge channel config from the environment (injectable for tests). An unset/invalid
 * `FRAMEWORK_NUDGE_CHANNEL` defaults to `email`; an unset/invalid `FRAMEWORK_NUDGE_WEBHOOK_URL`
 * disables the webhook (and, for `webhook`-only, falls back to email).
 */
export function resolveNudgeChannelConfig(
  env: Record<string, string | undefined> = process.env
): NudgeChannelConfig {
  // A set-but-invalid channel silently defaults to email — warn so a typo (which quietly disables the
  // webhook) leaves an operator signal rather than vanishing.
  const rawChannel = env.FRAMEWORK_NUDGE_CHANNEL;
  const channelParse = z.enum(NUDGE_CHANNELS).safeParse(rawChannel);
  if (rawChannel !== undefined && !channelParse.success) {
    logger.warn('Invalid FRAMEWORK_NUDGE_CHANNEL — defaulting to email', { value: rawChannel });
  }
  const channel = channelParse.success ? channelParse.data : 'email';

  // A set-but-invalid webhook URL warns too (for the webhook/both channels it means falling back).
  const rawUrl = env.FRAMEWORK_NUDGE_WEBHOOK_URL;
  const parsedUrl = z.string().url().safeParse(rawUrl);
  if (rawUrl !== undefined && rawUrl !== '' && !parsedUrl.success && channel !== 'email') {
    logger.warn('Invalid FRAMEWORK_NUDGE_WEBHOOK_URL — webhook channel disabled', {});
  }
  const webhookUrl = parsedUrl.success ? parsedUrl.data : null;

  const webhookEnabled = (channel === 'webhook' || channel === 'both') && webhookUrl !== null;
  // Email stays on unless the operator explicitly chose `webhook` AND a working URL exists — so a
  // misconfigured `webhook` (no / bad URL) falls back to email instead of dropping nudges.
  const emailEnabled = channel !== 'webhook' || !webhookEnabled;

  return { emailEnabled, webhookUrl: webhookEnabled ? webhookUrl : null };
}

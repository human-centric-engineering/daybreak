/**
 * Proactive-nudge channel config (f-governance-plus t-4). Pure — resolves the fork-owned env into
 * { emailEnabled, webhookUrl }. Proves the default (email), webhook-only, both, and the
 * misconfigured-webhook → email fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { resolveNudgeChannelConfig } from '@/lib/framework/facilitation/overlays/nudge-channel';
import { logger } from '@/lib/logging';

const URL = 'https://hooks.example.com/nudge';

beforeEach(() => vi.clearAllMocks());

describe('resolveNudgeChannelConfig', () => {
  it('defaults to email when nothing is set', () => {
    expect(resolveNudgeChannelConfig({})).toEqual({ emailEnabled: true, webhookUrl: null });
  });

  it('email channel: email on, webhook off (even if a URL is set)', () => {
    expect(
      resolveNudgeChannelConfig({
        FRAMEWORK_NUDGE_CHANNEL: 'email',
        FRAMEWORK_NUDGE_WEBHOOK_URL: URL,
      })
    ).toEqual({ emailEnabled: true, webhookUrl: null });
  });

  it('webhook channel with a valid URL: webhook on, email off', () => {
    expect(
      resolveNudgeChannelConfig({
        FRAMEWORK_NUDGE_CHANNEL: 'webhook',
        FRAMEWORK_NUDGE_WEBHOOK_URL: URL,
      })
    ).toEqual({ emailEnabled: false, webhookUrl: URL });
  });

  it('both channel with a valid URL: email AND webhook on', () => {
    expect(
      resolveNudgeChannelConfig({
        FRAMEWORK_NUDGE_CHANNEL: 'both',
        FRAMEWORK_NUDGE_WEBHOOK_URL: URL,
      })
    ).toEqual({ emailEnabled: true, webhookUrl: URL });
  });

  it('webhook channel with NO url: falls back to email (never drops nudges)', () => {
    expect(resolveNudgeChannelConfig({ FRAMEWORK_NUDGE_CHANNEL: 'webhook' })).toEqual({
      emailEnabled: true,
      webhookUrl: null,
    });
  });

  it('webhook channel with an INVALID url: falls back to email', () => {
    expect(
      resolveNudgeChannelConfig({
        FRAMEWORK_NUDGE_CHANNEL: 'webhook',
        FRAMEWORK_NUDGE_WEBHOOK_URL: 'not-a-url',
      })
    ).toEqual({ emailEnabled: true, webhookUrl: null });
  });

  it('an unknown channel value falls back to email AND warns', () => {
    expect(resolveNudgeChannelConfig({ FRAMEWORK_NUDGE_CHANNEL: 'sms' })).toEqual({
      emailEnabled: true,
      webhookUrl: null,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid FRAMEWORK_NUDGE_CHANNEL — defaulting to email',
      { value: 'sms' }
    );
  });

  it('warns when a webhook/both channel has an invalid URL (but not for the email channel)', () => {
    resolveNudgeChannelConfig({
      FRAMEWORK_NUDGE_CHANNEL: 'both',
      FRAMEWORK_NUDGE_WEBHOOK_URL: 'not-a-url',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid FRAMEWORK_NUDGE_WEBHOOK_URL — webhook channel disabled',
      {}
    );
    vi.clearAllMocks();
    // The email channel with a bad URL doesn't warn — the URL is irrelevant there.
    resolveNudgeChannelConfig({
      FRAMEWORK_NUDGE_CHANNEL: 'email',
      FRAMEWORK_NUDGE_WEBHOOK_URL: 'x',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not warn on the happy defaults (nothing set)', () => {
    resolveNudgeChannelConfig({});
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

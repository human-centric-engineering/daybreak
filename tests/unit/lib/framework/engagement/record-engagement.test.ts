/**
 * Unit tests: the engagement emit seam (f-engagement t-1).
 *
 * `recordModuleEngagement` has two isolated best-effort limbs — write a `JourneyEvent`
 * and fire `runModuleWorkflowBindings`. Prisma and the dispatch receiver are mocked; we
 * assert both limbs run with the right data, that each limb's failure is swallowed
 * without skipping the other or throwing to the caller, and that optional fields are
 * forwarded only when present.
 *
 * @see lib/framework/engagement/record-engagement.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createMock, runBindingsMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  runBindingsMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { journeyEvent: { create: createMock } },
}));
vi.mock('@/lib/framework/modules/workflow-bindings', () => ({
  runModuleWorkflowBindings: runBindingsMock,
}));
// Silence the seam's error logging (the failure-isolation tests exercise the catch arms).
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { recordModuleEngagement } from '@/lib/framework/engagement/record-engagement';
import * as engagement from '@/lib/framework/engagement';

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue({ id: 'evt-1' });
  runBindingsMock.mockResolvedValue({ matched: 0, dispatched: 0, skipped: [] });
});

describe('recordModuleEngagement', () => {
  it('writes the engagement event and fires the workflow bindings', async () => {
    await recordModuleEngagement({
      userId: 'user-1',
      moduleSlug: 'onboarding',
      type: 'module.entered',
    });

    expect(createMock).toHaveBeenCalledWith({
      data: { userId: 'user-1', moduleSlug: 'onboarding', type: 'module.entered' },
    });
    // userId is injected into the forwarded payload (a bound workflow only sees input.event).
    expect(runBindingsMock).toHaveBeenCalledWith('onboarding', 'module.entered', {
      userId: 'user-1',
    });
  });

  it('forwards journeyId + payload to the event row and merges payload into the binding call', async () => {
    await recordModuleEngagement({
      userId: 'user-1',
      moduleSlug: 'onboarding',
      type: 'module.feedback',
      journeyId: 'jrny-7',
      payload: { rating: 5 },
    });

    expect(createMock).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        moduleSlug: 'onboarding',
        type: 'module.feedback',
        journeyId: 'jrny-7',
        payload: { rating: 5 },
      },
    });
    expect(runBindingsMock).toHaveBeenCalledWith('onboarding', 'module.feedback', {
      userId: 'user-1',
      rating: 5,
    });
  });

  it('still fires the bindings when the event write fails (limbs are independent)', async () => {
    createMock.mockRejectedValue(new Error('db down'));

    await expect(
      recordModuleEngagement({ userId: 'u', moduleSlug: 'm', type: 'module.entered' })
    ).resolves.toBeUndefined();

    expect(runBindingsMock).toHaveBeenCalledOnce();
  });

  it('swallows a binding-dispatch failure without throwing to the caller', async () => {
    runBindingsMock.mockRejectedValue(new Error('dispatch exploded'));

    await expect(
      recordModuleEngagement({ userId: 'u', moduleSlug: 'm', type: 'module.entered' })
    ).resolves.toBeUndefined();

    // The event write still happened — a downstream failure doesn't roll it back.
    expect(createMock).toHaveBeenCalledOnce();
  });

  it('exposes the seam and the engagement vocabulary through the feature barrel', () => {
    expect(engagement.recordModuleEngagement).toBe(recordModuleEngagement);
    expect(engagement.ENGAGEMENT_EVENT_TYPE.moduleEntered).toBe('module.entered');
  });
});

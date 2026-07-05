/**
 * `get_state` capability (f-slot-capture t-1). Mocks the slot engine (`getSlotHeads`)
 * and the access seam (`canRead`) so no live DB is loaded — house style. Proves the X2
 * guard (canRead before the read; denied → empty), the no-user-context guard, the
 * head→view mapping, slug narrowing, and PII redaction.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/framework/data-slots/values', () => ({ getSlotHeads: vi.fn() }));
vi.mock('@/lib/framework/shared/access', () => ({ canRead: vi.fn() }));

import { GetStateCapability } from '@/lib/framework/data-slots/capabilities/get-state';
import { getSlotHeads } from '@/lib/framework/data-slots/values';
import { canRead } from '@/lib/framework/shared/access';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';

const cap = new GetStateCapability();
const ctx = (userId: string | null): CapabilityContext => ({ userId, agentId: 'agent-1' });
const head = (over: Record<string, unknown> = {}) => ({
  slotSlug: 'primary_goal',
  value: 'run a marathon',
  confidence: 8,
  capturedAt: new Date('2026-07-05T12:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canRead).mockResolvedValue(true);
});

describe('execute', () => {
  it('refuses with no_user_context for a system-initiated run', async () => {
    const result = await cap.execute({}, ctx(null));
    expect(result).toEqual({
      success: false,
      error: { code: 'no_user_context', message: expect.any(String) },
    });
    expect(canRead).not.toHaveBeenCalled();
    expect(getSlotHeads).not.toHaveBeenCalled();
  });

  it('reads the caller’s slot heads behind canRead and maps them to views', async () => {
    vi.mocked(getSlotHeads).mockResolvedValue([head()] as never);

    const result = await cap.execute({}, ctx('user-1'));

    expect(canRead).toHaveBeenCalledWith({ userId: 'user-1' }, 'user-1');
    expect(getSlotHeads).toHaveBeenCalledWith('user-1', undefined);
    expect(result).toEqual({
      success: true,
      data: {
        slots: [
          {
            slug: 'primary_goal',
            value: 'run a marathon',
            confidence: 8,
            capturedAt: '2026-07-05T12:00:00.000Z',
          },
        ],
      },
    });
  });

  it('narrows to the requested slugs', async () => {
    vi.mocked(getSlotHeads).mockResolvedValue([] as never);
    await cap.execute({ slotSlugs: ['primary_goal', 'readiness'] }, ctx('user-1'));
    expect(getSlotHeads).toHaveBeenCalledWith('user-1', {
      slotSlugs: ['primary_goal', 'readiness'],
    });
  });

  it('returns empty and never reads when canRead denies (X2)', async () => {
    vi.mocked(canRead).mockResolvedValue(false);
    const result = await cap.execute({}, ctx('viewer-2'));
    expect(result).toEqual({ success: true, data: { slots: [] } });
    expect(getSlotHeads).not.toHaveBeenCalled();
  });
});

describe('PII handling', () => {
  it('declares processesPii', () => {
    expect(cap.processesPii).toBe(true);
  });

  it('masks each slot value in the audit provenance, keeping slug + confidence', () => {
    const result = {
      success: true as const,
      data: {
        slots: [{ slug: 'primary_goal', value: 'run a marathon', confidence: 8, capturedAt: 'x' }],
      },
    };
    const redacted = cap.redactProvenance({}, result);
    const preview = JSON.parse(redacted.resultPreview);
    expect(preview.data.slots[0].slug).toBe('primary_goal');
    expect(preview.data.slots[0].confidence).toBe(8);
    expect(preview.data.slots[0].value).not.toContain('marathon');
  });
});

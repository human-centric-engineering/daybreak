/**
 * Integration test — SlotValuesBrowser (f-admin-surfaces t-1).
 *
 * The values browser renders the masked page it was handed; a masked `sensitive` row
 * offers a Reveal that triggers ONE `reveal=true` fetch (cached) and swaps in the
 * stored value; a `special_category` row is labelled "not stored" with no reveal; and
 * the cap hint fires when the total exceeds the shown page.
 *
 * @see components/admin/framework/slots/slot-values-browser.tsx
 */

import type { SlotValueHeadView } from '@/lib/framework/data-slots/view';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn() } };
});

import { SlotValuesBrowser } from '@/components/admin/framework/slots/slot-values-browser';
import { apiClient } from '@/lib/api/client';

function head(over: Partial<SlotValueHeadView> & Pick<SlotValueHeadView, 'id'>): SlotValueHeadView {
  return {
    userId: 'user_alice',
    slotSlug: 'health_note',
    version: 1,
    value: 'the value',
    valueJson: null,
    confidence: 8,
    sourceType: 'direct',
    sensitivity: 'standard',
    masked: false,
    capturedAt: '2026-06-01T10:00:00.000Z',
    ...over,
  };
}

describe('SlotValuesBrowser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a standard value plainly with no reveal button', () => {
    render(
      <SlotValuesBrowser
        slotSlug="primary_goal"
        initialValues={[head({ id: 'v1', slotSlug: 'primary_goal', value: 'run a marathon' })]}
        total={1}
      />
    );
    expect(screen.getByText('run a marathon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument();
  });

  it('reveals a masked sensitive value via a single reveal fetch', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockResolvedValue([
      {
        ...head({ id: 'v1' }),
        value: 'blood pressure 120/80',
        masked: false,
        sensitivity: 'sensitive',
      },
    ] as SlotValueHeadView[]);

    render(
      <SlotValuesBrowser
        slotSlug="health_note"
        initialValues={[
          head({
            id: 'v1',
            value: '<redacted: sensitive>',
            masked: true,
            sensitivity: 'sensitive',
          }),
        ]}
        total={1}
      />
    );

    expect(screen.getByText('<redacted: sensitive>')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reveal/i }));

    await waitFor(() => {
      expect(screen.getByText('blood pressure 120/80')).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/admin/framework/slot-values',
      expect.objectContaining({
        params: expect.objectContaining({ reveal: true, slotSlug: 'health_note' }),
      })
    );
    // A Hide affordance appears once revealed.
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('labels a special_category row as not stored, with no reveal', () => {
    render(
      <SlotValuesBrowser
        slotSlug="diagnosis"
        initialValues={[
          head({
            id: 'v1',
            slotSlug: 'diagnosis',
            value: '<redacted: special_category>',
            masked: true,
            sensitivity: 'special_category',
          }),
        ]}
        total={1}
      />
    );
    expect(screen.getByText('(not stored)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument();
  });

  it('shows the cap hint when the total exceeds the shown page', () => {
    render(
      <SlotValuesBrowser
        slotSlug="primary_goal"
        initialValues={[head({ id: 'v1', slotSlug: 'primary_goal' })]}
        total={140}
      />
    );
    expect(screen.getByText(/showing the first 1 of 140/i)).toBeInTheDocument();
  });

  it('renders an empty state when there are no values', () => {
    render(<SlotValuesBrowser slotSlug="primary_goal" initialValues={[]} total={0} />);
    expect(screen.getByText(/no values captured for this slot yet/i)).toBeInTheDocument();
  });
});

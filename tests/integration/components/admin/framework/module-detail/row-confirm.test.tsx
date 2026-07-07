/**
 * Unit test — RowConfirm (f-ops-views t-4c).
 *
 * The shared Confirm / Cancel pair for a destructive row action: labels, the busy state, and
 * the any-row-busy disable.
 *
 * @see components/admin/framework/module-detail/row-confirm.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RowConfirm } from '@/components/admin/framework/module-detail/row-confirm';

describe('RowConfirm', () => {
  it('renders Confirm / Cancel and fires the callbacks', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<RowConfirm busy={false} anyBusy={false} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /^confirm$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the busy label and disables both buttons while any row is busy', () => {
    render(<RowConfirm busy anyBusy onConfirm={vi.fn()} onCancel={vi.fn()} busyLabel="Working…" />);
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('accepts a custom confirm label', () => {
    render(
      <RowConfirm
        busy={false}
        anyBusy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirmLabel="Remove"
      />
    );
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });
});

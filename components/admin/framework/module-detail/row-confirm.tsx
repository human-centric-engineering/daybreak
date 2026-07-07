'use client';

/**
 * RowConfirm (f-ops-views t-4c) — the shared Confirm / Cancel button pair for the second step
 * of a destructive row action (unbind / revoke) in the module binding tables.
 *
 * Both buttons are disabled while any row is busy (`anyBusy`), so a confirm can't fire a
 * second mutation mid-flight; `busy` (this row is the one in flight) swaps the confirm label
 * to its progress text. Pairs with {@link useRowActions}.
 */

import { Button } from '@/components/ui/button';

interface RowConfirmProps {
  /** True while THIS row's mutation is in flight (drives the label). */
  busy: boolean;
  /** True while ANY row is busy (disables both buttons). */
  anyBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  busyLabel?: string;
}

export function RowConfirm({
  busy,
  anyBusy,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
}: RowConfirmProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant="destructive" onClick={onConfirm} disabled={anyBusy}>
        {busy ? busyLabel : confirmLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={anyBusy}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * PublishControls (f-map-editor t-4) — the header publish + history cluster. Proves the
 * Publish button is gated on a saved draft, the History button delegates, the confirm
 * dialog emits the trimmed change summary (or undefined), the over-limit guard blocks
 * publish, the error surfaces, and the success flash renders.
 *
 * @see components/admin/framework/map-builder/publish-controls.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PublishControls } from '@/components/admin/framework/map-builder/publish-controls';

function renderControls(overrides: Partial<React.ComponentProps<typeof PublishControls>> = {}) {
  const onPublish = vi.fn();
  const onOpenHistory = vi.fn();
  render(
    <PublishControls
      hasDraft
      nextVersion={3}
      publishing={false}
      errorMessage={null}
      published={false}
      onPublish={onPublish}
      onOpenHistory={onOpenHistory}
      {...overrides}
    />
  );
  return { onPublish, onOpenHistory };
}

describe('PublishControls', () => {
  it('disables Publish when there is no draft', () => {
    renderControls({ hasDraft: false });
    expect(screen.getByTestId('map-publish-open')).toBeDisabled();
  });

  it('opens History via the callback', async () => {
    const user = userEvent.setup();
    const { onOpenHistory } = renderControls();
    await user.click(screen.getByTestId('map-history-open'));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('shows the next version in the dialog and publishes with no summary', async () => {
    const user = userEvent.setup();
    const { onPublish } = renderControls({ nextVersion: 7 });
    await user.click(screen.getByTestId('map-publish-open'));
    expect(screen.getByText(/version 7/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('map-publish-confirm'));
    expect(onPublish).toHaveBeenCalledWith(undefined);
  });

  it('publishes with the trimmed change summary', async () => {
    const user = userEvent.setup();
    const { onPublish } = renderControls();
    await user.click(screen.getByTestId('map-publish-open'));
    await user.type(screen.getByTestId('map-publish-summary'), '  reworked gating  ');
    await user.click(screen.getByTestId('map-publish-confirm'));
    expect(onPublish).toHaveBeenCalledWith('reworked gating');
  });

  it('blocks publish when the summary is over the 500-char limit', async () => {
    const user = userEvent.setup();
    const { onPublish } = renderControls();
    await user.click(screen.getByTestId('map-publish-open'));
    fireEvent.change(screen.getByTestId('map-publish-summary'), {
      target: { value: 'a'.repeat(501) },
    });
    expect(screen.getByText(/1 characters over/i)).toBeInTheDocument();
    expect(screen.getByTestId('map-publish-confirm')).toBeDisabled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('surfaces a publish error in the dialog', async () => {
    const user = userEvent.setup();
    renderControls({ errorMessage: 'Map is not publishable' });
    await user.click(screen.getByTestId('map-publish-open'));
    expect(screen.getByRole('alert')).toHaveTextContent('Map is not publishable');
  });

  it('shows the Published flash indicator', () => {
    renderControls({ published: true });
    expect(screen.getByTestId('map-published-indicator')).toBeInTheDocument();
  });
});

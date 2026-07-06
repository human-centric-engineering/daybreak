/**
 * Integration test — VersionsTab (f-ops-views t-2).
 *
 * Lists immutable config versions (current badge on the newest), the two-step restore
 * confirm → POST → refresh flow, cancel, the empty state, and a restore error.
 *
 * @see components/admin/framework/module-detail/versions-tab.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ModuleVersionSummary } from '@/lib/framework/modules/view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
  APIClientError: class APIClientError extends Error {},
}));

import { VersionsTab } from '@/components/admin/framework/module-detail/versions-tab';
import { apiClient } from '@/lib/api/client';

function v(version: number, over: Partial<ModuleVersionSummary> = {}): ModuleVersionSummary {
  return {
    id: `id-${version}`,
    version,
    changeSummary: `change ${version}`,
    createdBy: 'admin',
    createdAt: '2026-02-01T10:00:00.000Z',
    ...over,
  };
}

const VERSIONS = [v(3), v(2), v(1)];

describe('VersionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists versions with the current badge on the newest and restore on the rest', () => {
    render(<VersionsTab slug="demo" versions={VERSIONS} currentVersion={3} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('current')).toBeInTheDocument();
    // v3 is current (no restore); v2 and v1 each get a Restore button.
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(2);
  });

  it('restores a prior version after confirm and refreshes', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue(undefined);

    render(<VersionsTab slug="demo" versions={VERSIONS} currentVersion={3} />);
    // Restore the oldest (v1) — its button is the last Restore button.
    const restoreButtons = screen.getAllByRole('button', { name: /^restore$/i });
    await user.click(restoreButtons[restoreButtons.length - 1]);
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/admin/framework/modules/demo/versions/1/restore'
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('cancels a restore without calling the API', async () => {
    const user = userEvent.setup();
    render(<VersionsTab slug="demo" versions={VERSIONS} currentVersion={3} />);
    await user.click(screen.getAllByRole('button', { name: /^restore$/i })[0]);
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getAllByRole('button', { name: /^restore$/i })).toHaveLength(2);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('shows the empty state when no versions exist', () => {
    render(<VersionsTab slug="demo" versions={[]} currentVersion={0} />);
    expect(screen.getByText(/no config has been saved yet/i)).toBeInTheDocument();
  });

  it('shows an error when the restore fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));

    render(<VersionsTab slug="demo" versions={VERSIONS} currentVersion={3} />);
    await user.click(screen.getAllByRole('button', { name: /^restore$/i })[0]);
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByText(/failed to restore/i)).toBeInTheDocument();
  });
});

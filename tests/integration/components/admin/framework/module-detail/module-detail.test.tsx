/**
 * Integration test — ModuleDetail shell (f-ops-views t-2 / t-3).
 *
 * The tabbed shell: header identity + status, and the Config / Versions / Settings tab
 * triggers with the Config tab active by default.
 *
 * @see components/admin/framework/module-detail/module-detail.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type {
  ModuleConfigFormView,
  ModuleSettingsView,
  ModuleVersionsView,
} from '@/lib/framework/modules/view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ModuleDetail } from '@/components/admin/framework/module-detail/module-detail';

const IDENTITY: ModuleSettingsView = {
  id: 'mod-1',
  slug: 'onboarding',
  name: 'Onboarding',
  status: 'active',
  audience: 'all',
  featureFlagName: null,
  availableFrom: null,
  availableUntil: null,
  isRegistered: true,
  updatedAt: '2026-02-01T00:00:00.000Z',
};
const CONFIG: ModuleConfigFormView = {
  registered: true,
  descriptors: [{ key: 'apiKey', type: 'string', label: 'Api Key', required: true }],
  values: {},
};
const VERSIONS: ModuleVersionsView = {
  versions: [
    {
      id: 'v1',
      version: 1,
      changeSummary: null,
      createdBy: 'u',
      createdAt: '2026-02-01T10:00:00.000Z',
    },
  ],
  nextCursor: null,
};

describe('ModuleDetail', () => {
  it('renders the module identity, status, and both tab triggers', () => {
    render(
      <ModuleDetail slug="onboarding" identity={IDENTITY} config={CONFIG} versions={VERSIONS} />
    );

    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('onboarding')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Config' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Versions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the Config tab content by default', () => {
    render(
      <ModuleDetail slug="onboarding" identity={IDENTITY} config={CONFIG} versions={VERSIONS} />
    );
    expect(screen.getByText('Api Key')).toBeInTheDocument();
  });

  it.each(['active', 'retired', 'draft'])('renders the %s status badge', (status) => {
    render(
      <ModuleDetail
        slug="onboarding"
        identity={{ ...IDENTITY, status }}
        config={CONFIG}
        versions={VERSIONS}
      />
    );
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('flags an unregistered module and handles an empty version history', () => {
    render(
      <ModuleDetail
        slug="onboarding"
        identity={{ ...IDENTITY, isRegistered: false }}
        config={CONFIG}
        versions={{ versions: [], nextCursor: null }}
      />
    );
    expect(screen.getByText('Unregistered')).toBeInTheDocument();
  });
});

/**
 * Integration test — Framework Modules list page (f-ops-views t-1).
 *
 * Tests the server component at `app/admin/framework/modules/page.tsx`: it
 * pre-renders the module list from a mocked `serverFetch` and hands it to
 * `<ModulesTable>`, and never throws when the fetch fails (renders the empty
 * state instead).
 *
 * @see app/admin/framework/modules/page.tsx
 */

import type { Module } from '@prisma/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

function makeModule(slug: string, name: string, over: Partial<Module> = {}): Module {
  return {
    id: `mod-${slug}`,
    slug,
    name,
    status: 'active',
    featureFlagName: null,
    availableFrom: null,
    availableUntil: null,
    audience: 'all',
    config: {},
    isRegistered: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...over,
  };
}

const MOCK_MODULES = [
  makeModule('onboarding', 'Onboarding'),
  makeModule('coaching', 'Coaching', { status: 'draft' }),
];

describe('FrameworkModulesPage (server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the "Modules" heading and rows from pre-fetched data', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: MOCK_MODULES });

    const { default: FrameworkModulesPage } = await import('@/app/admin/framework/modules/page');

    render(await FrameworkModulesPage());

    expect(screen.getByRole('heading', { name: /^modules$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Onboarding')).toBeInTheDocument();
      expect(screen.getByText('Coaching')).toBeInTheDocument();
    });
  });

  it('renders the empty state when the fetch is not ok (no throw)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    const { default: FrameworkModulesPage } = await import('@/app/admin/framework/modules/page');

    render(await FrameworkModulesPage());

    expect(screen.getByText('No modules registered yet.')).toBeInTheDocument();
  });

  it('renders the empty state when the API envelope is unsuccessful', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL', message: 'boom' },
    });

    const { default: FrameworkModulesPage } = await import('@/app/admin/framework/modules/page');

    render(await FrameworkModulesPage());

    expect(screen.getByText('No modules registered yet.')).toBeInTheDocument();
  });

  it('renders the empty state (no throw) when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: FrameworkModulesPage } = await import('@/app/admin/framework/modules/page');

    render(await FrameworkModulesPage());

    expect(screen.getByText('No modules registered yet.')).toBeInTheDocument();
  });
});

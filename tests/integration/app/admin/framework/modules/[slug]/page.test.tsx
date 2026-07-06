/**
 * Integration test — Framework Module detail page (f-ops-views t-2).
 *
 * The server component fans out three parallel fetches (identity from the list, config,
 * versions) and renders the tabbed detail; a module that isn't in the list 404s, and each
 * fetch degrades to empty state (rather than throwing) on failure.
 *
 * @see app/admin/framework/modules/[slug]/page.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const IDENTITY = {
  id: 'mod-1',
  slug: 'demo',
  name: 'Demo Module',
  status: 'active',
  audience: 'all',
  isRegistered: true,
  updatedAt: '2026-02-01T00:00:00.000Z',
};
const CONFIG = {
  registered: true,
  descriptors: [{ key: 'apiKey', type: 'string', label: 'Api Key', required: true }],
  values: {},
};
const VERSIONS = {
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

interface Outcomes {
  identityList?: unknown[];
  identityOk?: boolean;
  identitySuccess?: boolean;
  configOk?: boolean;
  configSuccess?: boolean;
  versionsOk?: boolean;
  versionsSuccess?: boolean;
  reject?: boolean;
}

async function setup(o: Outcomes = {}) {
  const {
    identityList = [IDENTITY],
    identityOk = true,
    identitySuccess = true,
    configOk = true,
    configSuccess = true,
    versionsOk = true,
    versionsSuccess = true,
    reject = false,
  } = o;

  const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');

  vi.mocked(serverFetch).mockImplementation(async (path: string) => {
    if (reject) throw new Error('network down');
    const ok = path.endsWith('/modules')
      ? identityOk
      : path.includes('/config')
        ? configOk
        : versionsOk;
    return { ok, __path: path } as unknown as Response;
  });

  vi.mocked(parseApiResponse).mockImplementation((async (res: { __path: string }) => {
    const p = res.__path;
    if (p.endsWith('/modules')) return { success: identitySuccess, data: identityList };
    if (p.includes('/config')) return { success: configSuccess, data: CONFIG };
    return { success: versionsSuccess, data: VERSIONS };
  }) as never);

  const { default: Page } = await import('@/app/admin/framework/modules/[slug]/page');
  return Page({ params: Promise.resolve({ slug: 'demo' }) });
}

describe('FrameworkModuleDetailPage (server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the module detail from the three fetches', async () => {
    render(await setup());
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
    expect(screen.getByText('Api Key')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Versions' })).toBeInTheDocument();
  });

  it('still renders when config and versions fail (degraded, not thrown)', async () => {
    render(await setup({ configOk: false, versionsSuccess: false }));
    // Heading still present; config degraded to the unregistered/read-only view.
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
    expect(screen.getByText(/no longer registered/i)).toBeInTheDocument();
  });

  it('also degrades on config envelope failure and versions HTTP failure', async () => {
    render(await setup({ configSuccess: false, versionsOk: false }));
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
  });

  it('404s when the module is not in the list', async () => {
    await expect(setup({ identityList: [] })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the list fetch is not ok', async () => {
    await expect(setup({ identityOk: false })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the list envelope is unsuccessful', async () => {
    await expect(setup({ identitySuccess: false })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s (no throw to the user) when every fetch rejects', async () => {
    await expect(setup({ reject: true })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

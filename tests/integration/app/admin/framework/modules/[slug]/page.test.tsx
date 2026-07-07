/**
 * Integration test — Framework Module detail page (f-ops-views t-2 / t-3 / t-4a).
 *
 * The server component fans out parallel fetches (identity via the single-module
 * `GET /modules/[slug]`, config, versions, agent bindings, agent-roles) and renders the
 * tabbed detail; a module that doesn't exist 404s, and the non-identity fetches degrade to
 * empty state (rather than throwing) on failure.
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
  featureFlagName: null,
  availableFrom: null,
  availableUntil: null,
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
  identityOk?: boolean;
  identitySuccess?: boolean;
  configOk?: boolean;
  configSuccess?: boolean;
  versionsOk?: boolean;
  versionsSuccess?: boolean;
  /** Applies to all three binding fetches (agents, agent-roles, workflows). */
  bindingsOk?: boolean;
  bindingsSuccess?: boolean;
  reject?: boolean;
}

// Classify a request path: config / versions / agents / agent-roles are sub-paths of the
// bare module path, so check the more specific segments first; anything else is the
// single-module identity GET. ('/agent-roles' and '/agents' are distinct substrings.)
function classify(
  path: string
): 'config' | 'versions' | 'agentRoles' | 'agents' | 'workflows' | 'knowledge' | 'identity' {
  if (path.includes('/config')) return 'config';
  if (path.includes('/versions')) return 'versions';
  if (path.includes('/agent-roles')) return 'agentRoles';
  if (path.includes('/agents')) return 'agents';
  if (path.includes('/workflows')) return 'workflows';
  if (path.includes('/knowledge')) return 'knowledge';
  return 'identity';
}

const AGENT_ROLES = { registered: true, roles: ['companion'] };

async function setup(o: Outcomes = {}) {
  const {
    identityOk = true,
    identitySuccess = true,
    configOk = true,
    configSuccess = true,
    versionsOk = true,
    versionsSuccess = true,
    bindingsOk = true,
    bindingsSuccess = true,
    reject = false,
  } = o;

  const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');

  vi.mocked(serverFetch).mockImplementation(async (path: string) => {
    if (reject) throw new Error('network down');
    const ok = {
      config: configOk,
      versions: versionsOk,
      agentRoles: bindingsOk,
      agents: bindingsOk,
      workflows: bindingsOk,
      knowledge: bindingsOk,
      identity: identityOk,
    }[classify(path)];
    return { ok, __path: path } as unknown as Response;
  });

  vi.mocked(parseApiResponse).mockImplementation((async (res: { __path: string }) => {
    switch (classify(res.__path)) {
      case 'config':
        return { success: configSuccess, data: CONFIG };
      case 'versions':
        return { success: versionsSuccess, data: VERSIONS };
      case 'agentRoles':
        return { success: bindingsSuccess, data: AGENT_ROLES };
      case 'agents':
        return { success: bindingsSuccess, data: [] };
      case 'workflows':
        return { success: bindingsSuccess, data: [] };
      case 'knowledge':
        return { success: bindingsSuccess, data: { documents: [], tags: [] } };
      default:
        return { success: identitySuccess, data: IDENTITY };
    }
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
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workflows' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Knowledge' })).toBeInTheDocument();
  });

  it('still renders when config and versions fail (degraded, not thrown)', async () => {
    render(await setup({ configOk: false, versionsSuccess: false }));
    // Heading still present; a config-fetch failure shows a load error, NOT the false
    // "unregistered" claim (that's reserved for a genuine registered:false response).
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
    expect(screen.getByText(/couldn.t be loaded/i)).toBeInTheDocument();
  });

  it('also degrades on config envelope failure and versions HTTP failure', async () => {
    render(await setup({ configSuccess: false, versionsOk: false }));
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
  });

  it('still renders when the binding fetches fail (HTTP not ok → null, not thrown)', async () => {
    render(await setup({ bindingsOk: false }));
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
  });

  it('still renders when the binding envelopes are unsuccessful', async () => {
    render(await setup({ bindingsSuccess: false }));
    expect(screen.getByRole('heading', { name: 'Demo Module' })).toBeInTheDocument();
  });

  it('404s when the identity fetch is not ok (module not found)', async () => {
    await expect(setup({ identityOk: false })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the identity envelope is unsuccessful', async () => {
    await expect(setup({ identitySuccess: false })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s (no throw to the user) when every fetch rejects', async () => {
    await expect(setup({ reject: true })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

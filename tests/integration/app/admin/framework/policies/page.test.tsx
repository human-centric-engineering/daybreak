/**
 * Integration test — Framework Policies list page (f-admin-surfaces t-2).
 *
 * The server component at `app/admin/framework/policies/page.tsx` pre-renders the
 * facilitation-policy list from a mocked `serverFetch` and hands it to
 * `<PoliciesTable>`, never throwing when the fetch fails (renders the empty state
 * instead) — the modules / journeys / slots list precedent.
 *
 * @see app/admin/framework/policies/page.tsx
 */

import type { FacilitationPolicyView } from '@/lib/framework/facilitation/policies/view';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// next/navigation is used by the client table (router.refresh on mutations).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function makePolicy(over: Partial<FacilitationPolicyView> = {}): FacilitationPolicyView {
  return {
    id: 'pol-1',
    kind: 'auto_approval',
    enabled: true,
    payload: { autoApprove: 'none' },
    createdBy: 'user_admin',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

const MOCK_POLICIES: FacilitationPolicyView[] = [
  makePolicy({ id: 'pol-1', kind: 'auto_approval', payload: { autoApprove: 'none' } }),
  makePolicy({
    id: 'pol-2',
    kind: 'escalation',
    payload: {
      scope: { type: 'facilitation_role', id: 'facilitator' },
      signal: { guard: 'output', outcome: 'blocked' },
      priority: 'high',
    },
  }),
];

describe('FrameworkPoliciesPage (server component)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the "Policies" heading and rows from pre-fetched data', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({ success: true, data: MOCK_POLICIES });

    const { default: FrameworkPoliciesPage } = await import('@/app/admin/framework/policies/page');
    render(await FrameworkPoliciesPage());

    expect(screen.getByRole('heading', { name: /^policies$/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('auto_approval')).toBeInTheDocument();
      expect(screen.getByText('escalation')).toBeInTheDocument();
    });
    // The compact payload summary is rendered per row.
    expect(screen.getByText(/auto-approve: none/)).toBeInTheDocument();
  });

  it('renders the empty state when the fetch is not ok (no throw)', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: false } as Response);

    const { default: FrameworkPoliciesPage } = await import('@/app/admin/framework/policies/page');
    render(await FrameworkPoliciesPage());

    expect(
      screen.getByText('No governance policies yet. Create one to start.')
    ).toBeInTheDocument();
  });

  it('renders the empty state when the API envelope is unsuccessful', async () => {
    const { serverFetch, parseApiResponse } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(parseApiResponse).mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL', message: 'boom' },
    });

    const { default: FrameworkPoliciesPage } = await import('@/app/admin/framework/policies/page');
    render(await FrameworkPoliciesPage());

    expect(
      screen.getByText('No governance policies yet. Create one to start.')
    ).toBeInTheDocument();
  });

  it('renders the empty state (no throw) when serverFetch rejects', async () => {
    const { serverFetch } = await import('@/lib/api/server-fetch');
    vi.mocked(serverFetch).mockRejectedValue(new Error('network down'));

    const { default: FrameworkPoliciesPage } = await import('@/app/admin/framework/policies/page');
    render(await FrameworkPoliciesPage());

    expect(
      screen.getByText('No governance policies yet. Create one to start.')
    ).toBeInTheDocument();
  });
});

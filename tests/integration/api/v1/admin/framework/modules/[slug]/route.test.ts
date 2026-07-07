/**
 * Integration tests — framework module lifecycle admin API (f-ops-views t-3).
 *
 * The HTTP contract over the single-module read + settings-write service: admin-guarded,
 * body / path params validated, the ISO-string window bounds coerced to `Date`, the right
 * service function called with mapped args, standard envelope, and domain errors surfaced
 * with their status (a `ConflictError` from a registered-module delete → 409). The service
 * + queries are mocked (their behaviour is proven in tests/integration/lib/framework/*).
 *
 * Mocks via `vi.hoisted` and referenced directly, so this test — under an `api/` path —
 * never imports `@/lib/framework` beyond the route itself and stays on the right side of X6.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  getModuleSettings: vi.fn(),
  updateModuleSettings: vi.fn(),
  deleteModule: vi.fn(),
}));

vi.mock('@/lib/framework/modules/queries', () => ({ getModuleSettings: svc.getModuleSettings }));
vi.mock('@/lib/framework/modules/service', () => ({
  updateModuleSettings: svc.updateModuleSettings,
  deleteModule: svc.deleteModule,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as route from '@/app/api/v1/admin/framework/modules/[slug]/route';
import { auth } from '@/lib/auth/config';
import { ConflictError } from '@/lib/api/errors';

const URL = 'http://localhost/api/v1/admin/framework/modules/onboarding';

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(URL, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const ctx = (slug = 'onboarding') => ({ params: Promise.resolve({ slug }) });
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());

const SETTINGS = {
  id: 'mod-1',
  slug: 'onboarding',
  name: 'Onboarding',
  status: 'active',
  audience: 'all',
  featureFlagName: null,
  availableFrom: null,
  availableUntil: null,
  isRegistered: false,
  updatedAt: '2026-02-01T00:00:00.000Z',
};

describe('GET /modules/[slug]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the module settings for an admin', async () => {
    asAdmin();
    svc.getModuleSettings.mockResolvedValue(SETTINGS);

    const res = await route.GET(req('GET'), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: SETTINGS });
    expect(svc.getModuleSettings).toHaveBeenCalledWith('onboarding');
  });

  it('401s for an unauthenticated request', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    const res = await route.GET(req('GET'), ctx());
    expect(res.status).toBe(401);
    expect(svc.getModuleSettings).not.toHaveBeenCalled();
  });

  it('403s for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.GET(req('GET'), ctx());
    expect(res.status).toBe(403);
  });
});

describe('PATCH /modules/[slug]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coerces ISO window bounds to Date and calls the service', async () => {
    asAdmin();
    svc.updateModuleSettings.mockResolvedValue(SETTINGS);

    const res = await route.PATCH(
      req('PATCH', { status: 'active', availableFrom: '2026-03-01T00:00:00.000Z' }),
      ctx()
    );

    expect(res.status).toBe(200);
    expect(svc.updateModuleSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'onboarding',
        userId: mockAdminUser().user.id,
        patch: { status: 'active', availableFrom: new Date('2026-03-01T00:00:00.000Z') },
      })
    );
  });

  it('maps the string fields (name / audience / featureFlagName) straight through', async () => {
    asAdmin();
    svc.updateModuleSettings.mockResolvedValue(SETTINGS);

    await route.PATCH(
      req('PATCH', { name: 'Renamed', audience: 'invite', featureFlagName: 'beta' }),
      ctx()
    );

    expect(svc.updateModuleSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { name: 'Renamed', audience: 'invite', featureFlagName: 'beta' },
      })
    );
  });

  it('passes null through to clear the flag / window bound', async () => {
    asAdmin();
    svc.updateModuleSettings.mockResolvedValue(SETTINGS);

    await route.PATCH(req('PATCH', { featureFlagName: null, availableUntil: null }), ctx());

    expect(svc.updateModuleSettings).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { featureFlagName: null, availableUntil: null } })
    );
  });

  it('400s on an empty body without calling the service', async () => {
    asAdmin();
    const res = await route.PATCH(req('PATCH', {}), ctx());
    expect(res.status).toBe(400);
    expect(svc.updateModuleSettings).not.toHaveBeenCalled();
  });

  it('400s on an unknown key', async () => {
    asAdmin();
    const res = await route.PATCH(req('PATCH', { config: {} }), ctx());
    expect(res.status).toBe(400);
    expect(svc.updateModuleSettings).not.toHaveBeenCalled();
  });

  it('403s for a non-admin (no write)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.PATCH(req('PATCH', { status: 'active' }), ctx());
    expect(res.status).toBe(403);
    expect(svc.updateModuleSettings).not.toHaveBeenCalled();
  });
});

describe('DELETE /modules/[slug]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes and returns { deleted: true } for an admin', async () => {
    asAdmin();
    svc.deleteModule.mockResolvedValue(undefined);

    const res = await route.DELETE(req('DELETE'), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: { deleted: true } });
    expect(svc.deleteModule).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'onboarding', userId: mockAdminUser().user.id })
    );
  });

  it('surfaces a ConflictError (registered module) as 409', async () => {
    asAdmin();
    svc.deleteModule.mockRejectedValue(new ConflictError('A registered module cannot be deleted'));

    const res = await route.DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(409);
  });

  it('403s for a non-admin (no delete)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser());
    const res = await route.DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(403);
    expect(svc.deleteModule).not.toHaveBeenCalled();
  });
});

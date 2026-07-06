/**
 * Integration tests — framework module config admin API (f-module-config t-2).
 *
 * The HTTP contract over the config read side + versioning service: admin-guarded, bodies
 * / query / path params validated, the right function called with mapped args, standard
 * envelope. The service + queries are mocked (their behaviour is proven against a stateful
 * fake in tests/integration/lib/framework/modules/config/*).
 *
 * Mocks via `vi.hoisted` and referenced directly, so this test — under an `api/` path —
 * never imports `@/lib/framework` and stays on the right side of X6.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

const svc = vi.hoisted(() => ({
  saveModuleConfig: vi.fn(),
  listModuleVersions: vi.fn(),
  restoreModuleVersion: vi.fn(),
  getModuleConfigForm: vi.fn(),
}));

vi.mock('@/lib/framework/modules/config/version-service', () => ({
  saveModuleConfig: svc.saveModuleConfig,
  listModuleVersions: svc.listModuleVersions,
  restoreModuleVersion: svc.restoreModuleVersion,
}));
vi.mock('@/lib/framework/modules/config/queries', () => ({
  getModuleConfigForm: svc.getModuleConfigForm,
}));
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

import * as configRoute from '@/app/api/v1/admin/framework/modules/[slug]/config/route';
import * as versionsRoute from '@/app/api/v1/admin/framework/modules/[slug]/versions/route';
import * as restoreRoute from '@/app/api/v1/admin/framework/modules/[slug]/versions/[version]/restore/route';
import { auth } from '@/lib/auth/config';

const CONFIG_URL = 'http://localhost/api/v1/admin/framework/modules/reading/config';
const VERSIONS_URL = 'http://localhost/api/v1/admin/framework/modules/reading/versions';
const RESTORE_URL = 'http://localhost/api/v1/admin/framework/modules/reading/versions/2/restore';

function req(method: string, body?: unknown, url = CONFIG_URL): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}
const slugCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const restoreCtx = (slug: string, version: string) => ({
  params: Promise.resolve({ slug, version }),
});
const asAdmin = () => vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
async function parse<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

beforeEach(() => vi.clearAllMocks());

describe('admin guard', () => {
  it('GET config returns 401 unauthenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());
    expect((await configRoute.GET(req('GET'), slugCtx('reading'))).status).toBe(401);
  });

  it('PUT config returns 403 for a non-admin and does not touch the service', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser('USER'));
    const res = await configRoute.PUT(req('PUT', { config: {} }), slugCtx('reading'));
    expect(res.status).toBe(403);
    expect(svc.saveModuleConfig).not.toHaveBeenCalled();
  });

  it('POST restore returns 403 for a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser('USER'));
    const res = await restoreRoute.POST(
      req('POST', undefined, RESTORE_URL),
      restoreCtx('reading', '2')
    );
    expect(res.status).toBe(403);
    expect(svc.restoreModuleVersion).not.toHaveBeenCalled();
  });
});

describe('GET /config', () => {
  beforeEach(asAdmin);

  it('returns the config form from getModuleConfigForm', async () => {
    svc.getModuleConfigForm.mockResolvedValue({
      registered: true,
      descriptors: [{ key: 'tone', type: 'enum', label: 'Tone', required: false, options: ['a'] }],
      values: { tone: 'a' },
    });
    const res = await configRoute.GET(req('GET'), slugCtx('reading'));
    expect(res.status).toBe(200);
    const body = await parse<{ success: boolean; data: { registered: boolean } }>(res);
    expect(body.success).toBe(true);
    expect(body.data.registered).toBe(true);
    expect(svc.getModuleConfigForm).toHaveBeenCalledWith('reading');
  });

  it('400s on a malformed slug without touching the service', async () => {
    const res = await configRoute.GET(req('GET'), slugCtx('Not A Slug'));
    expect(res.status).toBe(400);
    expect(svc.getModuleConfigForm).not.toHaveBeenCalled();
  });
});

describe('PUT /config', () => {
  beforeEach(asAdmin);

  it('validates the body and calls saveModuleConfig with mapped args', async () => {
    svc.saveModuleConfig.mockResolvedValue({ version: { version: 3 } });
    const res = await configRoute.PUT(
      req('PUT', { config: { tone: 'gentle' }, changeSummary: 'tuned' }),
      slugCtx('reading')
    );
    expect(res.status).toBe(200);
    expect(svc.saveModuleConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'reading',
        config: { tone: 'gentle' },
        changeSummary: 'tuned',
        userId: mockAdminUser().user.id,
      })
    );
  });

  it('400s when config is not an object, without touching the service', async () => {
    const res = await configRoute.PUT(req('PUT', { config: 'nope' }), slugCtx('reading'));
    expect(res.status).toBe(400);
    expect(svc.saveModuleConfig).not.toHaveBeenCalled();
  });
});

describe('GET /versions', () => {
  beforeEach(asAdmin);

  it('lists versions via listModuleVersions', async () => {
    svc.listModuleVersions.mockResolvedValue({
      versions: [{ version: 2 }, { version: 1 }],
      nextCursor: null,
    });
    const res = await versionsRoute.GET(req('GET', undefined, VERSIONS_URL), slugCtx('reading'));
    expect(res.status).toBe(200);
    expect(svc.listModuleVersions).toHaveBeenCalledWith(
      'reading',
      expect.objectContaining({ limit: 50 })
    );
  });
});

describe('POST /versions/[version]/restore', () => {
  beforeEach(asAdmin);

  it('restores a version, mapping the path param to a number', async () => {
    svc.restoreModuleVersion.mockResolvedValue({ version: { version: 5 } });
    const res = await restoreRoute.POST(
      req('POST', undefined, RESTORE_URL),
      restoreCtx('reading', '2')
    );
    expect(res.status).toBe(200);
    expect(svc.restoreModuleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'reading', version: 2, userId: mockAdminUser().user.id })
    );
  });

  it('400s on a non-numeric version param without touching the service', async () => {
    const res = await restoreRoute.POST(
      req('POST', undefined, RESTORE_URL),
      restoreCtx('reading', 'abc')
    );
    expect(res.status).toBe(400);
    expect(svc.restoreModuleVersion).not.toHaveBeenCalled();
  });
});

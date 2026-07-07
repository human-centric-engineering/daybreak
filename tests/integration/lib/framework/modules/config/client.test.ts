/**
 * Integration test — module config client helper (f-ops-views t-2).
 *
 * `saveModuleConfig` is the PUT the shared `apiClient` can't do (it has no `put`). Verifies
 * it PUTs the right body and surfaces the server's field errors as an `APIClientError`.
 *
 * @see lib/framework/modules/config/client.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { saveModuleConfig } from '@/lib/framework/modules/config/client';
import { APIClientError } from '@/lib/api/client';

const fetchMock = vi.fn();

describe('saveModuleConfig (client)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs the config to the module endpoint and returns the new version', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          version: { id: 'v2', version: 2, changeSummary: null, createdBy: 'u', createdAt: 'x' },
        },
      }),
    });

    const res = await saveModuleConfig('demo', { config: { a: 1 }, changeSummary: 'tweak' });

    expect(res.version.version).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/admin/framework/modules/demo/config');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ config: { a: 1 }, changeSummary: 'tweak' });
  });

  it('throws APIClientError carrying the server field errors on a 422', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Module config is invalid',
          details: { config: ['apiKey: Required'] },
        },
      }),
    });

    await expect(saveModuleConfig('demo', { config: {} })).rejects.toBeInstanceOf(APIClientError);

    try {
      await saveModuleConfig('demo', { config: {} });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(APIClientError);
      expect((err as APIClientError).status).toBe(422);
      expect((err as APIClientError).details?.config).toEqual(['apiKey: Required']);
    }
  });

  it('throws with a fallback message when the body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(saveModuleConfig('demo', { config: {} })).rejects.toMatchObject({
      name: 'APIClientError',
      status: 500,
      message: 'Request failed (500)',
    });
  });
});

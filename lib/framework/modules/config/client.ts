/**
 * Client-side calls for the module config surface (f-ops-views t-2).
 *
 * The config save is a **PUT** (`saveModuleConfig` replaces the whole config), but the
 * shared `apiClient` (`lib/api/client.ts`) exposes only get/post/patch/delete — and it's
 * Sunrise-owned, so we don't add a `put` there. This thin helper does the PUT with the
 * same envelope semantics `apiClient` uses (`{ success, data | error }`) and throws the
 * same core `APIClientError` on failure, so callers get uniform error handling — in
 * particular `error.details` carries the server's field-level validation messages (A4).
 *
 * The restore call is a POST and uses `apiClient.post` directly at its call site.
 */

'use client';

import { APIClientError } from '@/lib/api/client';
import type { ModuleVersionSummary } from '@/lib/framework/modules/view';

export interface SaveModuleConfigBody {
  config: Record<string, unknown>;
  changeSummary?: string;
}

/**
 * PUT the module's operator config. Resolves to the newly-snapshotted version on success;
 * throws `APIClientError` (with `details` on a 422 schema-validation failure) otherwise.
 */
export async function saveModuleConfig(
  slug: string,
  body: SaveModuleConfigBody
): Promise<{ version: ModuleVersionSummary }> {
  const res = await fetch(`/api/v1/admin/framework/modules/${encodeURIComponent(slug)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through to the generic error below
  }

  const envelope = (json ?? {}) as {
    success?: boolean;
    data?: { version: ModuleVersionSummary };
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  };

  if (!res.ok || !envelope.success || !envelope.data) {
    throw new APIClientError(
      envelope.error?.message ?? `Request failed (${res.status})`,
      envelope.error?.code,
      res.status,
      envelope.error?.details
    );
  }

  return envelope.data;
}

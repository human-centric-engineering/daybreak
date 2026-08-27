'use client';

/**
 * Client-side calls for the module config surface (f-ops-views t-2).
 *
 * The `'use client'` directive is ABOVE this docblock, and that position is
 * load-bearing. It used to sit below, which is equally valid JavaScript and was
 * invisible to `tests/unit/lib/security/outbound-fetch-redirects.test.ts`: that
 * guard reads the first 200 characters looking for the directive, and this
 * docblock is longer than that, so the file read as server-side code and the
 * `fetch` below was reported as an unguarded outbound call. It is not one — a
 * browser issuing a same-origin request to a relative path cannot be
 * redirected somewhere a server would then trust, which is the SSRF shape that
 * guard exists for. Moving the directive says what the module already was; an
 * EXEMPT row in a Sunrise-owned test would have said it less accurately.
 *
 * The config save is a **PUT** (`saveModuleConfig` replaces the whole config), but the
 * shared `apiClient` (`lib/api/client.ts`) exposes only get/post/patch/delete — and it's
 * Sunrise-owned, so we don't add a `put` there. This helper does the PUT, then parses the
 * response through the shared `parseApiResponse` (so the envelope contract stays in one
 * place, not re-implemented here) and throws the same core `APIClientError` on failure —
 * `error.details` carries the server's field-level validation messages (A4).
 *
 * `parseApiResponse` is imported from `@/lib/api/parse-response` directly, NOT via
 * `@/lib/api/server-fetch` (which pulls in `next/headers` — server-only — and would break
 * this `'use client'` module's bundle).
 *
 * The restore call is a POST and uses `apiClient.post` directly at its call site.
 */

import { APIClientError } from '@/lib/api/client';
import { parseApiResponse } from '@/lib/api/parse-response';
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

  let parsed;
  try {
    parsed = await parseApiResponse<{ version: ModuleVersionSummary }>(res);
  } catch {
    // Non-JSON / malformed body — surface a uniform error carrying the HTTP status.
    throw new APIClientError(`Request failed (${res.status})`, undefined, res.status);
  }

  if (!parsed.success) {
    throw new APIClientError(
      parsed.error.message,
      parsed.error.code,
      res.status,
      parsed.error.details
    );
  }

  return parsed.data;
}

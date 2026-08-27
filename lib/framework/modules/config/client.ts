'use client';

/**
 * Client-side calls for the module config surface (f-ops-views t-2).
 *
 * The `'use client'` directive above is load-bearing beyond bundling: it is what
 * tells `tests/unit/lib/security/outbound-fetch-redirects.test.ts` that the
 * `fetch` below is not a server-side call. That guard exists for SSRF — a
 * server following an unvalidated `Location` — which does not apply to a
 * browser issuing a same-origin request to a relative path. Declaring what the
 * module IS is the honest way past it; an EXEMPT row would have meant editing a
 * Sunrise-owned test to say the same thing less accurately.
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

'use client';

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

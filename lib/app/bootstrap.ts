/**
 * App boot bridge — the fork-owned target of core's generic `initApp()` seam.
 *
 * Core's `instrumentation.ts` calls `initApp()` once at server startup (nodejs
 * runtime, production + development). Sunrise ships this file EMPTY; Daybreak
 * fills it to boot the framework tier, then delegates to a reserved leaf hook.
 * This is the ONE `lib/app/*` file Daybreak fills — the single sanctioned
 * core → framework bridge (the ESLint boundary exempts `lib/app/**` for exactly
 * this reason; see f-bootstrap t-2 ↔ t-3).
 *
 * `@/lib/framework` is imported DYNAMICALLY on purpose: a static specifier is
 * resolved at BUILD time, so Sunrise or a sibling fork (no `lib/framework/`
 * folder) would fail `next build`. The reference lives only in this fork-owned
 * file, never in core — which is why `instrumentation.ts` calls this seam rather
 * than importing the framework directly.
 */

import { logger } from '@/lib/logging';
import { initLeafApp } from '@/lib/app/leaf-bootstrap';

export async function initApp(): Promise<void> {
  // Framework tier. Errors are logged, not thrown: a framework boot bug must not
  // crash server startup (core degrades gracefully — `buildContext` still works
  // without the contributor) nor block the leaf hook or the dev maintenance tick.
  try {
    const { initFramework } = await import('@/lib/framework');
    initFramework();
  } catch (err) {
    logger.error('initApp: framework initialisation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Leaf app (a fork of Daybreak) — reserved, empty by default.
  await initLeafApp();
}

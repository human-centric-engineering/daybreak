/**
 * App boot bridge — the fork-owned target of core's generic `initApp()` seam.
 *
 * Core's `instrumentation.ts` calls `initApp()` once at server startup (nodejs
 * runtime, production + development). In upstream Sunrise this file is empty by
 * default (the generic seam is fork-first here — to be filed upstream, see the
 * boot-seam follow-up in the f-bootstrap plan); Daybreak fills it to boot the
 * framework tier, then delegates to a reserved leaf hook. This is the ONE
 * `lib/app/*` file Daybreak fills — the single sanctioned core → framework bridge
 * (the ESLint boundary exempts `lib/app/**` for exactly this reason; see
 * f-bootstrap t-2 ↔ t-3).
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
  // Framework init is isolated from leaf init: a framework boot bug is logged,
  // not thrown, so core degrades gracefully (`buildContext` still works without
  // the contributor) AND the leaf hook below still runs. A failure of the leaf
  // hook (or of this whole function) is in turn isolated from the rest of server
  // startup by the try/catch around `initApp()` in `instrumentation.ts`.
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

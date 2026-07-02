/**
 * Leaf-app boot hook — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) fills `initLeafApp()` with its own one-time
 * startup steps. It runs at server startup after the framework is initialised
 * (called by `lib/app/bootstrap.ts`'s `initApp()`) — nodejs runtime, production
 * and development. Daybreak keeps it empty: this is the leaf's boot seam, the
 * counterpart of the reserved `lib/app/eslint.config.mjs` and the `lib/app/*`
 * registration scaffolds.
 *
 * Non-`async` (returns a resolved promise) so the empty default doesn't trip an
 * empty-`async` lint flag; a leaf filling it will typically make it `async`.
 */
export function initLeafApp(): Promise<void> {
  // No leaf boot steps by default.
  return Promise.resolve();
}

/**
 * Leaf-app database drift-probe registration — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) fills `registerLeafDriftProbes()` with its own
 * `registerAppDriftProbe()` calls for the Prisma-unmodelled objects it adds (most commonly the
 * hand-written FK behind a satellite `User` table — see CUSTOMIZATION.md §5). Daybreak keeps it
 * empty: this is the leaf's drift seam, reserved so a leaf's probes merge cleanly on upgrade — the
 * drift analogue of `lib/app/leaf-bootstrap.ts` / `lib/app/leaf-admin-nav.ts`.
 *
 * Called by `lib/app/db-drift.ts`'s `registerAppDriftProbes()` after the framework probes are
 * registered.
 */

export function registerLeafDriftProbes(): void {
  // No leaf drift probes by default.
}

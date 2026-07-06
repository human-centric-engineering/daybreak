/**
 * Leaf-app admin-nav registration — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) fills `initLeafAdminNav()` with its own
 * `registerNavSection()` calls to add admin sidebar sections — the client-nav
 * counterpart of the `lib/app/leaf-bootstrap.ts` boot hook. Daybreak keeps it
 * empty: this is the leaf's nav seam, reserved so a leaf's sections merge
 * cleanly on upgrade.
 *
 * Called (synchronously) by `lib/app/admin-nav.ts`'s `initAppNav()` after the
 * framework section is registered. Keep it SYNC + client-safe — nav
 * registration is read during the sidebar's render, so it cannot be async (see
 * `lib/admin-nav/registry.ts`).
 */
export function initLeafAdminNav(): void {
  // No leaf admin-nav sections by default.
}

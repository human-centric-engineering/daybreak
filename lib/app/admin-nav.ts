/**
 * App admin-sidebar nav registrations — the fork-owned bridge that wires the
 * framework's (and the leaf's) sidebar sections into the shared registry.
 *
 * **Fork-owned scaffold.** Upstream Sunrise ships this empty and does not change
 * it after release, so Daybreak's edits here merge cleanly on upgrade (the
 * stable contract is this file's `initAppNav` export, not its body). Treat it
 * like the landing page: a starting point you're expected to modify.
 *
 * Auto-wired: `components/admin/admin-sidebar.tsx` (a `'use client'` component)
 * calls `initAppNav()` once at module load — on both the server render and in
 * the client bundle — so the registry is populated before
 * `getRegisteredNavSections()` is read during render.
 *
 * Daybreak fills it to register the **framework** nav section, then delegates to
 * the reserved **leaf** hook — the client-nav analogue of the boot bridge
 * (`bootstrap.ts` → `initFramework()` → `leaf-bootstrap.ts`). This is the SECOND
 * `lib/app/*` file Daybreak fills (after `bootstrap.ts`); `lib/app/**` is the
 * sanctioned core→framework bridge (the ESLint boundary exempts it).
 *
 * NOTE — `@/lib/framework/admin-nav` is imported STATICALLY, and this is FORCED,
 * not a style choice: nav registration must be synchronous (the `'use client'`
 * sidebar reads the registry during render and cannot `await`), so the dynamic
 * `import()` the boot bridge (`bootstrap.ts`) uses is simply not available here.
 * The static specifier is safe because this filled bridge lives only in Daybreak
 * — vanilla Sunrise ships the empty version with no framework import, and every
 * Daybreak leaf fork has the `lib/framework/` folder, so it always resolves.
 * (`bootstrap.ts` reaches for dynamic import because its boot path is async and
 * can afford it — not because a static import would be unsafe there.)
 * `lib/framework/admin-nav.ts` is deliberately kept client-safe for this path.
 */

import { initFrameworkNav } from '@/lib/framework/admin-nav';
import { initLeafAdminNav } from '@/lib/app/leaf-admin-nav';

export function initAppNav(): void {
  initFrameworkNav();
  initLeafAdminNav();
}

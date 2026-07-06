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
 * NOTE — `@/lib/framework/admin-nav` is imported STATICALLY (unlike the boot
 * bridge's dynamic import): nav registration is synchronous — it must run at
 * module-eval, before the sidebar reads the registry during render, so it cannot
 * `await` a dynamic import. A static specifier is safe here because the
 * reference lives only in Daybreak's filled copy (vanilla Sunrise ships the
 * empty version, with no framework import) and every Daybreak leaf fork has the
 * `lib/framework/` folder, so it always resolves. `lib/framework/admin-nav.ts`
 * is deliberately client-safe for exactly this path.
 */

import { initFrameworkNav } from '@/lib/framework/admin-nav';
import { initLeafAdminNav } from '@/lib/app/leaf-admin-nav';

export function initAppNav(): void {
  initFrameworkNav();
  initLeafAdminNav();
}

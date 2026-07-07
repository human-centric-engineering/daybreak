/**
 * Framework admin-sidebar nav registration (f-ops-views t-1).
 *
 * Registers the "Framework" section — the entry points for the framework's
 * operational admin surfaces (Modules first; more land with later f-ops-views
 * tasks) — into the shared admin-nav registry (`lib/admin-nav/registry.ts`).
 *
 * Wiring: `lib/app/admin-nav.ts`'s `initAppNav()` calls this, and Sunrise's
 * `components/admin/admin-sidebar.tsx` (a `'use client'` component) calls
 * `initAppNav()` at module-eval. So this file runs inside the CLIENT sidebar
 * bundle and MUST stay client-safe — the registrar + `lucide-react` icons only,
 * never server code (no Prisma, no server-only registry).
 *
 * This is the client-nav analogue of the boot seam (`lib/app/bootstrap.ts` →
 * `initFramework()`): `initAppNav()` → `initFrameworkNav()` (here) →
 * `initLeafAdminNav()`. Registration is idempotent by section `title`.
 */

import { Boxes, Route } from 'lucide-react';
import { registerNavSection } from '@/lib/admin-nav/registry';

export function initFrameworkNav(): void {
  registerNavSection({
    title: 'Framework',
    items: [
      {
        href: '/admin/framework/modules',
        label: 'Modules',
        icon: Boxes,
        description: 'Registered modules — config, bindings, lifecycle',
      },
      {
        href: '/admin/framework/journeys',
        label: 'Journeys',
        icon: Route,
        description: 'Explore and replay individual user journeys',
      },
    ],
  });
}

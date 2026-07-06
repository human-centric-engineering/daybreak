/**
 * Unit test — the app admin-nav bridge (f-ops-views t-1).
 *
 * `initAppNav()` (the fork-owned `lib/app/admin-nav.ts`) wires the framework nav
 * section into the shared registry, then delegates to the empty leaf hook — the
 * client-nav analogue of the boot bridge. This test asserts the end-to-end
 * wiring the sidebar relies on.
 *
 * It lives under the DEFAULT ESLint glob (not `tests/**\/lib/framework/**`), so
 * it imports `@/lib/app/admin-nav` (which statically pulls in the framework nav
 * at runtime) rather than `@/lib/framework/*` directly.
 *
 * @see lib/app/admin-nav.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { initAppNav } from '@/lib/app/admin-nav';
import { getRegisteredNavSections, __resetNavRegistryForTests } from '@/lib/admin-nav/registry';

describe('initAppNav (framework nav wiring)', () => {
  beforeEach(() => {
    __resetNavRegistryForTests();
  });

  it('wires the framework nav section into the registry', () => {
    initAppNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    expect(framework).toBeDefined();
    expect(framework?.items?.some((i) => i.href === '/admin/framework/modules')).toBe(true);
  });

  it('is idempotent (the sidebar calls it on both server and client renders)', () => {
    initAppNav();
    initAppNav();

    expect(getRegisteredNavSections().filter((s) => s.title === 'Framework')).toHaveLength(1);
  });
});

/**
 * Unit test — framework admin-nav registration (f-ops-views t-1).
 *
 * `initFrameworkNav()` registers the "Framework" sidebar section into the shared
 * admin-nav registry. This lives under `tests/**\/lib/framework/**` (the
 * framework ESLint glob) so it may import `@/lib/framework/*` directly.
 *
 * @see lib/framework/admin-nav.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { initFrameworkNav } from '@/lib/framework/admin-nav';
import { getRegisteredNavSections, __resetNavRegistryForTests } from '@/lib/admin-nav/registry';

describe('initFrameworkNav', () => {
  beforeEach(() => {
    __resetNavRegistryForTests();
  });

  it('registers a "Framework" section with a Modules item', () => {
    initFrameworkNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    expect(framework).toBeDefined();

    const modules = framework?.items?.find((i) => i.href === '/admin/framework/modules');
    expect(modules).toBeDefined();
    expect(modules?.label).toBe('Modules');
    expect(modules?.description).toBeTruthy();
    // Icon is a lucide component (a `forwardRef` render component).
    expect(modules?.icon).toBeDefined();
  });

  it('is idempotent by title (repeated calls do not duplicate the section)', () => {
    initFrameworkNav();
    initFrameworkNav();

    const frameworkSections = getRegisteredNavSections().filter((s) => s.title === 'Framework');
    expect(frameworkSections).toHaveLength(1);
  });
});

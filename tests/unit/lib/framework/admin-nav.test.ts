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

  it('registers a Journeys item (f-ops-views t-5b)', () => {
    initFrameworkNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    const journeys = framework?.items?.find((i) => i.href === '/admin/framework/journeys');
    expect(journeys).toBeDefined();
    expect(journeys?.label).toBe('Journeys');
    expect(journeys?.description).toBeTruthy();
    expect(journeys?.icon).toBeDefined();
  });

  it('registers a Slots item (f-admin-surfaces t-1)', () => {
    initFrameworkNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    const slots = framework?.items?.find((i) => i.href === '/admin/framework/slots');
    expect(slots).toBeDefined();
    expect(slots?.label).toBe('Slots');
    expect(slots?.description).toBeTruthy();
    expect(slots?.icon).toBeDefined();
  });

  it('registers a Policies item (f-admin-surfaces t-2)', () => {
    initFrameworkNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    const policies = framework?.items?.find((i) => i.href === '/admin/framework/policies');
    expect(policies).toBeDefined();
    expect(policies?.label).toBe('Policies');
    expect(policies?.description).toBeTruthy();
    expect(policies?.icon).toBeDefined();
  });

  it('registers a Proposals item (f-admin-surfaces t-3)', () => {
    initFrameworkNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    const proposals = framework?.items?.find((i) => i.href === '/admin/framework/proposals');
    expect(proposals).toBeDefined();
    expect(proposals?.label).toBe('Proposals');
    expect(proposals?.description).toBeTruthy();
    expect(proposals?.icon).toBeDefined();
  });

  it('registers an Atlas item (f-atlas t-2a)', () => {
    initFrameworkNav();

    const framework = getRegisteredNavSections().find((s) => s.title === 'Framework');
    const atlas = framework?.items?.find((i) => i.href === '/admin/framework/atlas');
    expect(atlas).toBeDefined();
    expect(atlas?.label).toBe('Atlas');
    expect(atlas?.description).toBeTruthy();
    expect(atlas?.icon).toBeDefined();
  });

  it('is idempotent by title (repeated calls do not duplicate the section)', () => {
    initFrameworkNav();
    initFrameworkNav();

    const frameworkSections = getRegisteredNavSections().filter((s) => s.title === 'Framework');
    expect(frameworkSections).toHaveLength(1);
  });
});

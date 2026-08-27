/**
 * Framework boot — real end-to-end integration.
 *
 * Exercises the actual chain the boot seam drives: initApp() → real
 * initFramework() → real registerContextContributor() → real buildContext().
 * Only context-builder's leaf-tier / IO dependencies are mocked (logging,
 * knowledge search, the leaf context-contributors scaffold), so the framework
 * side and the core registry run for real. Proves the tiers compose, not just
 * that each unit works in isolation.
 *
 * ---------------------------------------------------------------------------
 * FORK NOTE — this reads the real `lib/app/bootstrap.ts`, not a mock
 * ---------------------------------------------------------------------------
 * That is deliberate: the property under test is that Daybreak's FILLED boot
 * bridge reaches `initFramework()` and survives a failure inside it, and a
 * mocked seam cannot show either. The cost is that a leaf fork which fills
 * `lib/app/leaf-bootstrap.ts` changes what this measures — its own boot work
 * runs here too.
 *
 * **What a leaf should expect, and what to do.** If your leaf's boot work is
 * side-effect-free, nothing changes. If it registers or touches a database,
 * this file will exercise it. Pin your own expectation rather than deleting a
 * case: add an assertion that your leaf hook ran, and keep the existing ones —
 * they hold the contract that boot NEVER rejects into instrumentation, which is
 * as load-bearing for your fork as it is for Daybreak.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/orchestration/knowledge/search', () => ({
  getPatternDetail: vi.fn(),
}));
vi.mock('@/lib/app/context-contributors', () => ({
  initAppContextContributors: vi.fn(),
}));
// Neutralise the DB half of the boot: initApp() now also runs syncFramework() →
// syncRegisteredModules(). This test proves the CONTRIBUTOR wiring composes across
// tiers; the sync's SQL shape is covered by sync.test.ts (no live DB in vitest).
vi.mock('@/lib/framework/modules/sync', () => ({
  syncRegisteredModules: vi.fn(() => Promise.resolve()),
}));

const { initApp } = await import('@/lib/app/bootstrap');
const { MODULE_CONTEXT_TYPE, MODULE_CONTEXT_UNAVAILABLE } =
  await import('@/lib/framework/modules/context');
const { buildContext, clearContextCache, __resetContextContributorsForTests } =
  await import('@/lib/orchestration/chat/context-builder');

beforeEach(() => {
  __resetContextContributorsForTests();
  clearContextCache();
});

describe('framework boot (integration)', () => {
  it('before boot: buildContext falls back to core’s no-loader placeholder', async () => {
    const out = await buildContext(MODULE_CONTEXT_TYPE, 'demo');
    expect(out).toContain("No context loader for type 'module'");
  });

  it('after initApp: the framework contributor handles the module type', async () => {
    await initApp();
    clearContextCache();
    const out = await buildContext(MODULE_CONTEXT_TYPE, 'demo');
    // The framework contributor's own body appears (proves ITS loader ran), and
    // core's unknown-type fallback does not.
    expect(out).toContain(MODULE_CONTEXT_UNAVAILABLE);
    expect(out).not.toContain('No context loader');
  });
});

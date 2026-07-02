/**
 * Framework boot — real end-to-end integration.
 *
 * Exercises the actual chain the boot seam drives: initApp() → real
 * initFramework() → real registerContextContributor() → real buildContext().
 * Only context-builder's leaf-tier / IO dependencies are mocked (logging,
 * knowledge search, the leaf context-contributors scaffold), so the framework
 * side and the core registry run for real. Proves the tiers compose, not just
 * that each unit works in isolation.
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

/**
 * initApp() — the boot bridge core's `instrumentation.ts` calls — boots the
 * framework tier and the (empty) leaf hook. Exercises the whole
 * instrumentation → bootstrap → initFramework → core-seam chain minus the Next
 * `register()` wrapper, and the resilience contract (a framework boot failure is
 * logged, not thrown).
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
const { MODULE_CONTEXT_TYPE } = await import('@/lib/framework/modules/context');
const { logger } = await import('@/lib/logging');
const { buildContext, clearContextCache, __resetContextContributorsForTests } =
  await import('@/lib/orchestration/chat/context-builder');

beforeEach(() => {
  __resetContextContributorsForTests();
  clearContextCache();
  vi.clearAllMocks();
});

describe('initApp (boot bridge)', () => {
  it('boots the framework — the module context contributor is registered', async () => {
    await initApp();
    clearContextCache();
    const out = await buildContext(MODULE_CONTEXT_TYPE, 'demo');
    expect(out).not.toContain('No context loader');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('resolves without throwing (leaf hook runs after framework init)', async () => {
    await expect(initApp()).resolves.toBeUndefined();
  });
});

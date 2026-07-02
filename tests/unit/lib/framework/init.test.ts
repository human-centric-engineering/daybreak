/**
 * initFramework() registers the framework's context contributor into core's
 * seam. Proves the boot path is registry-shaped — a contributor resolves the
 * framework's context type after init, and is gone when the registry is stripped
 * — not welded into core's `buildContext` switch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only context-builder's own dependencies, so the REAL context-builder
// (and its shared contributors map) loads — the same instance initFramework
// registers into. Mirrors tests/unit/lib/orchestration/chat/context-builder.test.ts.
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/orchestration/knowledge/search', () => ({
  getPatternDetail: vi.fn(),
}));
vi.mock('@/lib/app/context-contributors', () => ({
  initAppContextContributors: vi.fn(),
}));

const { initFramework } = await import('@/lib/framework');
const { MODULE_CONTEXT_TYPE } = await import('@/lib/framework/modules/context');
const { buildContext, clearContextCache, __resetContextContributorsForTests } =
  await import('@/lib/orchestration/chat/context-builder');

beforeEach(() => {
  __resetContextContributorsForTests();
  clearContextCache();
});

describe('initFramework', () => {
  it('leaves the module context type unresolved before init', async () => {
    const out = await buildContext(MODULE_CONTEXT_TYPE, 'demo');
    expect(out).toContain("No context loader for type 'module'");
  });

  it('registers the module context contributor on init', async () => {
    initFramework();
    clearContextCache();
    const out = await buildContext(MODULE_CONTEXT_TYPE, 'demo');
    expect(out).not.toContain('No context loader');
    expect(out).toContain('LOCKED CONTEXT');
  });

  it('is idempotent — a double boot keeps a single working contributor', async () => {
    initFramework();
    initFramework();
    clearContextCache();
    const out = await buildContext(MODULE_CONTEXT_TYPE, 'demo');
    expect(out).not.toContain('No context loader');
  });
});

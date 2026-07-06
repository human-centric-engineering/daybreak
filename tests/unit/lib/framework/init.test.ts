/**
 * initFramework() unit test — asserts its exact contract: it registers the
 * framework's one context contributor (the "module" type → `loadModuleContext`)
 * into core's seam. Mocks the core module so the assertion is on the
 * registration call itself, not on `buildContext`'s framing (which is core-owned
 * and would make the test brittle / tautological). The real end-to-end chain is
 * covered by tests/integration/lib/framework/boot.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestration/chat/context-builder', () => ({
  registerContextContributor: vi.fn(),
}));
vi.mock('@/lib/orchestration/knowledge/agent-access-contributors', () => ({
  registerAgentAccessContributor: vi.fn(),
}));

const { registerContextContributor } = await import('@/lib/orchestration/chat/context-builder');
const { registerAgentAccessContributor } =
  await import('@/lib/orchestration/knowledge/agent-access-contributors');
const { initFramework } = await import('@/lib/framework');
const { loadModuleContext, MODULE_CONTEXT_TYPE, MODULE_CONTEXT_UNAVAILABLE } =
  await import('@/lib/framework/modules/context');
const { resolveModuleKnowledgeForAgent, MODULE_KNOWLEDGE_CONTRIBUTOR_KEY } =
  await import('@/lib/framework/modules/knowledge/contributor');

const registerMock = registerContextContributor as ReturnType<typeof vi.fn>;
const registerAccessMock = registerAgentAccessContributor as ReturnType<typeof vi.fn>;

beforeEach(() => {
  registerMock.mockClear();
  registerAccessMock.mockClear();
});

describe('initFramework', () => {
  it('registers exactly the module context contributor', () => {
    initFramework();
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith(MODULE_CONTEXT_TYPE, loadModuleContext);
  });

  it('registers exactly one context contributor per boot', () => {
    initFramework();
    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('registers the module knowledge access contributor under its key', () => {
    initFramework();
    expect(registerAccessMock).toHaveBeenCalledTimes(1);
    expect(registerAccessMock).toHaveBeenCalledWith(
      MODULE_KNOWLEDGE_CONTRIBUTOR_KEY,
      resolveModuleKnowledgeForAgent
    );
  });
});

describe('loadModuleContext (scaffold)', () => {
  it('resolves to the "not available yet" body until f-module-core supplies a real loader', async () => {
    await expect(loadModuleContext('any-slug')).resolves.toBe(MODULE_CONTEXT_UNAVAILABLE);
  });
});

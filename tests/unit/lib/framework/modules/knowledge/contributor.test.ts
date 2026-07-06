/**
 * Module knowledge access contributor (f-module-bindings t-4).
 *
 * `resolveModuleKnowledgeForAgent` computes an agent's module-derived docs/tags live
 * from its bindings ⋈ the module knowledge pivots — union across all bound modules,
 * deduped; empty when the agent is bound to nothing.
 *
 * @see lib/framework/modules/knowledge/contributor.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { prismaFake, store, resetStore } = vi.hoisted(() => {
  const store = {
    bindings: [] as Array<{ agentId: string; moduleId: string }>,
    docs: [] as Array<{ moduleId: string; documentId: string }>,
    tags: [] as Array<{ moduleId: string; tagId: string }>,
  };
  const prismaFake = {
    moduleAgentBinding: {
      findMany: async ({ where }: any) =>
        store.bindings.filter((b) => b.agentId === where.agentId).map((b) => ({ ...b })),
    },
    moduleKnowledgeDocument: {
      findMany: async ({ where }: any) =>
        store.docs.filter((d) => where.moduleId.in.includes(d.moduleId)).map((d) => ({ ...d })),
    },
    moduleKnowledgeTag: {
      findMany: async ({ where }: any) =>
        store.tags.filter((t) => where.moduleId.in.includes(t.moduleId)).map((t) => ({ ...t })),
    },
  };
  return {
    prismaFake,
    store,
    resetStore: () => {
      store.bindings = [];
      store.docs = [];
      store.tags = [];
    },
  };
});

vi.mock('@/lib/db/client', () => ({ prisma: prismaFake }));

import { resolveModuleKnowledgeForAgent } from '@/lib/framework/modules/knowledge/contributor';

beforeEach(() => resetStore());

describe('resolveModuleKnowledgeForAgent', () => {
  it('returns {} when the agent is bound to no module', async () => {
    expect(await resolveModuleKnowledgeForAgent('agent-1')).toEqual({});
  });

  it('returns a single module’s docs and tags', async () => {
    store.bindings.push({ agentId: 'a1', moduleId: 'm1' });
    store.docs.push({ moduleId: 'm1', documentId: 'doc-1' });
    store.tags.push({ moduleId: 'm1', tagId: 'tag-1' });

    expect(await resolveModuleKnowledgeForAgent('a1')).toEqual({
      documentIds: ['doc-1'],
      tagIds: ['tag-1'],
    });
  });

  it('unions across every module the agent is bound to, deduped', async () => {
    store.bindings.push(
      { agentId: 'a1', moduleId: 'm1' },
      { agentId: 'a1', moduleId: 'm2' },
      // A second binding into m1 (different seat) must not double-count.
      { agentId: 'a1', moduleId: 'm1' }
    );
    store.docs.push(
      { moduleId: 'm1', documentId: 'doc-1' },
      { moduleId: 'm2', documentId: 'doc-2' },
      { moduleId: 'm2', documentId: 'doc-1' } // shared doc across modules → deduped
    );
    store.tags.push({ moduleId: 'm2', tagId: 'tag-2' });

    const result = await resolveModuleKnowledgeForAgent('a1');
    expect(result.documentIds?.sort()).toEqual(['doc-1', 'doc-2']);
    expect(result.tagIds).toEqual(['tag-2']);
  });

  it('ignores other agents’ bindings', async () => {
    store.bindings.push({ agentId: 'other', moduleId: 'm1' });
    store.docs.push({ moduleId: 'm1', documentId: 'doc-1' });
    expect(await resolveModuleKnowledgeForAgent('a1')).toEqual({});
  });
});

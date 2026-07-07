/**
 * Atlas aggregate readers (f-atlas t-1) — the ALL-MODULES widenings of the shipped per-module
 * binding/grant readers.
 *
 * Under test: the canonical batch-stitch widened to every module — one query for the pivot rows +
 * one batched core-row stitch, **independent of the module count** (the no-N+1 guarantee), the
 * `?? null` degrade on a vanished core row, and the map reader's unpublished/corrupt degrades. The
 * map parser (`mapDefinitionSchema`) is REAL so parse/degrade is exercised for real; `@/lib/db/client`
 * is mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    moduleAgentBinding: { findMany: vi.fn() },
    moduleWorkflowBinding: { findMany: vi.fn() },
    moduleKnowledgeDocument: { findMany: vi.fn() },
    moduleKnowledgeTag: { findMany: vi.fn() },
    aiAgent: { findMany: vi.fn() },
    aiWorkflow: { findMany: vi.fn() },
    aiKnowledgeDocument: { findMany: vi.fn() },
    knowledgeTag: { findMany: vi.fn() },
    facilitationGraph: { findMany: vi.fn() },
    facilitationGraphVersion: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/logging', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import {
  listAllModuleAgentBindings,
  listAllModuleWorkflowBindings,
  listAllModuleKnowledgeGrants,
  listPublishedMaps,
} from '@/lib/framework/atlas/queries';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';

const p = vi.mocked(prisma, true);

beforeEach(() => vi.clearAllMocks());

describe('listAllModuleAgentBindings', () => {
  it('stitches agents with ONE batched query across all modules (no per-module fan-out)', async () => {
    // Two modules, three bindings, agent a1 reused across modules — one aiAgent.findMany, deduped.
    p.moduleAgentBinding.findMany.mockResolvedValue([
      { id: 'b1', moduleId: 'm1', agentId: 'a1', role: 'companion', isPrimary: true },
      { id: 'b2', moduleId: 'm2', agentId: 'a1', role: 'reviewer', isPrimary: false },
      { id: 'b3', moduleId: 'm2', agentId: 'a2', role: 'companion', isPrimary: true },
    ] as never);
    p.aiAgent.findMany.mockResolvedValue([
      { id: 'a1', name: 'Aria', slug: 'aria', isActive: true, deletedAt: null },
      { id: 'a2', name: 'Bo', slug: 'bo', isActive: true, deletedAt: null },
    ] as never);

    const result = await listAllModuleAgentBindings();

    expect(p.aiAgent.findMany).toHaveBeenCalledTimes(1);
    expect(p.aiAgent.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] } },
      select: { id: true, name: true, slug: true, isActive: true, deletedAt: true },
    });
    expect(result).toHaveLength(3);
    expect(result[0].agent?.name).toBe('Aria');
    expect(result[1].agent?.name).toBe('Aria'); // reused agent stitched onto both bindings
  });

  it('degrades a vanished agent to null and short-circuits when there are no bindings', async () => {
    p.moduleAgentBinding.findMany.mockResolvedValueOnce([
      { id: 'b1', moduleId: 'm1', agentId: 'gone', role: 'companion', isPrimary: true },
    ] as never);
    p.aiAgent.findMany.mockResolvedValueOnce([] as never);
    expect((await listAllModuleAgentBindings())[0].agent).toBeNull();

    p.moduleAgentBinding.findMany.mockResolvedValueOnce([] as never);
    expect(await listAllModuleAgentBindings()).toEqual([]);
    expect(p.aiAgent.findMany).toHaveBeenCalledTimes(1); // not called on the empty run
  });
});

describe('listAllModuleWorkflowBindings', () => {
  it('computes hasPublishedVersion and stitches with one batched query', async () => {
    p.moduleWorkflowBinding.findMany.mockResolvedValue([
      { id: 'wb1', moduleId: 'm1', workflowId: 'w1', eventType: 'module.completed', enabled: true },
      { id: 'wb2', moduleId: 'm2', workflowId: 'w2', eventType: 'module.entered', enabled: false },
    ] as never);
    p.aiWorkflow.findMany.mockResolvedValue([
      { id: 'w1', name: 'Follow-up', slug: 'follow-up', isActive: true, publishedVersionId: 'v1' },
      { id: 'w2', name: 'Draft WF', slug: 'draft-wf', isActive: true, publishedVersionId: null },
    ] as never);

    const result = await listAllModuleWorkflowBindings();

    expect(p.aiWorkflow.findMany).toHaveBeenCalledTimes(1);
    expect(result[0].workflow?.hasPublishedVersion).toBe(true);
    expect(result[1].workflow?.hasPublishedVersion).toBe(false); // unpublished → "won't fire yet"
  });

  it('degrades a vanished workflow to null and short-circuits when empty', async () => {
    p.moduleWorkflowBinding.findMany.mockResolvedValueOnce([
      { id: 'wb1', moduleId: 'm1', workflowId: 'gone', eventType: 'module.entered', enabled: true },
    ] as never);
    p.aiWorkflow.findMany.mockResolvedValueOnce([] as never);
    expect((await listAllModuleWorkflowBindings())[0].workflow).toBeNull();

    p.moduleWorkflowBinding.findMany.mockResolvedValueOnce([] as never);
    expect(await listAllModuleWorkflowBindings()).toEqual([]);
    expect(p.aiWorkflow.findMany).toHaveBeenCalledTimes(1); // not called on the empty run
  });
});

describe('listAllModuleKnowledgeGrants', () => {
  it('stitches document + tag grants and degrades a removed document to null fields', async () => {
    p.moduleKnowledgeDocument.findMany.mockResolvedValue([
      { moduleId: 'm1', documentId: 'd1' },
      { moduleId: 'm1', documentId: 'gone' },
    ] as never);
    p.moduleKnowledgeTag.findMany.mockResolvedValue([{ moduleId: 'm2', tagId: 't1' }] as never);
    p.aiKnowledgeDocument.findMany.mockResolvedValue([
      { id: 'd1', name: 'Handbook', slug: 'handbook', status: 'ready' },
    ] as never);
    p.knowledgeTag.findMany.mockResolvedValue([{ id: 't1', name: 'Core', slug: 'core' }] as never);

    const result = await listAllModuleKnowledgeGrants();

    const doc = result.find((g) => g.entityId === 'd1');
    const removed = result.find((g) => g.entityId === 'gone');
    const tag = result.find((g) => g.entityId === 't1');
    expect(doc).toMatchObject({ kind: 'document', name: 'Handbook', status: 'ready' });
    expect(removed).toMatchObject({ name: null, slug: null });
    expect(tag).toMatchObject({ kind: 'tag', name: 'Core', status: null });
  });

  it('skips the core-stitch queries when there are no grants of a kind', async () => {
    p.moduleKnowledgeDocument.findMany.mockResolvedValue([] as never);
    p.moduleKnowledgeTag.findMany.mockResolvedValue([] as never);

    expect(await listAllModuleKnowledgeGrants()).toEqual([]);
    expect(p.aiKnowledgeDocument.findMany).not.toHaveBeenCalled();
    expect(p.knowledgeTag.findMany).not.toHaveBeenCalled();
  });
});

describe('listPublishedMaps', () => {
  const publishedDef = {
    nodes: [{ key: 'intro', type: 'module', moduleSlug: 'onboarding' }],
    edges: [],
  };

  it('parses a published map and degrades unpublished + corrupt maps without throwing', async () => {
    p.facilitationGraph.findMany.mockResolvedValue([
      { slug: 'live', name: 'Live', publishedVersionId: 'v1' },
      { slug: 'draft', name: 'Draft', publishedVersionId: null },
      { slug: 'broken', name: 'Broken', publishedVersionId: 'v9' },
    ] as never);
    p.facilitationGraphVersion.findMany.mockResolvedValue([
      { id: 'v1', version: 3, definition: publishedDef },
      { id: 'v9', version: 2, definition: { nodes: 'not-an-array' } },
    ] as never);

    const result = await listPublishedMaps();

    const live = result.find((m) => m.slug === 'live');
    const draft = result.find((m) => m.slug === 'draft');
    const broken = result.find((m) => m.slug === 'broken');
    expect(live).toMatchObject({ version: 3 });
    expect(live?.definition?.nodes[0]?.moduleSlug).toBe('onboarding');
    expect(draft).toMatchObject({ version: null, definition: null }); // unpublished
    expect(broken).toMatchObject({ version: 2, definition: null }); // corrupt → degraded
    expect(logger.error).toHaveBeenCalledTimes(1); // the corrupt map is logged
  });

  it('short-circuits with no graphs', async () => {
    p.facilitationGraph.findMany.mockResolvedValue([] as never);
    expect(await listPublishedMaps()).toEqual([]);
    expect(p.facilitationGraphVersion.findMany).not.toHaveBeenCalled();
  });
});

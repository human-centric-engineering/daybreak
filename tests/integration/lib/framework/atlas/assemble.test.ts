/**
 * Atlas composition assembler (f-atlas t-1) — `assembleComposition`.
 *
 * Under test: the COMPOSITION — the normalized projection shape, cross-cutting entity dedup (an
 * agent bound into two modules is ONE entity), every relationship emitted as a typed edge, the
 * degrade rules (a vanished core row drops its edge, a tombstoned agent is kept + flagged), and the
 * empty-deployment shape. The aggregate readers + registry are mocked (their own behaviour is proven
 * in `queries.test.ts`); `moduleCapabilitySlug` + `FACILITATION_ROLE_VALUES` are REAL.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const readers = vi.hoisted(() => ({
  listModules: vi.fn(),
  getRegisteredModule: vi.fn(),
  getRegisteredModules: vi.fn(),
  listSlotDefinitions: vi.fn(),
  listFacilitationBindings: vi.fn(),
  listFacilitationPolicies: vi.fn(),
  getRegisteredFrameworkCapabilities: vi.fn(),
  listAllModuleAgentBindings: vi.fn(),
  listAllModuleWorkflowBindings: vi.fn(),
  listAllModuleKnowledgeGrants: vi.fn(),
  listPublishedMaps: vi.fn(),
}));

vi.mock('@/lib/framework/modules/queries', () => ({ listModules: readers.listModules }));
vi.mock('@/lib/framework/modules/registry', () => ({
  getRegisteredModule: readers.getRegisteredModule,
  getRegisteredModules: readers.getRegisteredModules,
}));
vi.mock('@/lib/framework/data-slots/queries', () => ({
  listSlotDefinitions: readers.listSlotDefinitions,
}));
vi.mock('@/lib/framework/facilitation/agents/binding-queries', () => ({
  listFacilitationBindings: readers.listFacilitationBindings,
}));
vi.mock('@/lib/framework/facilitation/policies/policy-queries', () => ({
  listFacilitationPolicies: readers.listFacilitationPolicies,
}));
vi.mock('@/lib/framework/capabilities/registry', () => ({
  getRegisteredFrameworkCapabilities: readers.getRegisteredFrameworkCapabilities,
}));
vi.mock('@/lib/framework/atlas/queries', () => ({
  listAllModuleAgentBindings: readers.listAllModuleAgentBindings,
  listAllModuleWorkflowBindings: readers.listAllModuleWorkflowBindings,
  listAllModuleKnowledgeGrants: readers.listAllModuleKnowledgeGrants,
  listPublishedMaps: readers.listPublishedMaps,
}));

import { assembleComposition } from '@/lib/framework/atlas/assemble';
import type { AtlasEdge, AtlasEdgeKind } from '@/lib/framework/atlas/view';

const agentA1 = { id: 'a1', name: 'Aria', slug: 'aria', isActive: true, deletedAt: null };
const agentA2 = { id: 'a2', name: 'Facil', slug: 'facil', isActive: true, deletedAt: null };
const readingDef = {
  slug: 'reading',
  description: 'Read stuff',
  agentRoles: ['companion', 'reviewer'],
  capabilities: [{ slug: 'save_worksheet' }],
};

/** Wire the mocks to a small representative deployment (two modules, one retired). */
function seedDeployment(): void {
  readers.listModules.mockResolvedValue([
    {
      id: 'm1',
      slug: 'reading',
      name: 'Reading',
      status: 'active',
      audience: 'all',
      isRegistered: true,
    },
    {
      id: 'm2',
      slug: 'writing',
      name: 'Writing',
      status: 'retired',
      audience: 'all',
      isRegistered: false,
    },
  ]);
  readers.getRegisteredModule.mockImplementation((slug: string) =>
    slug === 'reading' ? readingDef : undefined
  );
  readers.getRegisteredModules.mockReturnValue([readingDef]);
  readers.listAllModuleAgentBindings.mockResolvedValue([
    { moduleId: 'm1', agentId: 'a1', role: 'companion', isPrimary: true, agent: agentA1 },
    { moduleId: 'm2', agentId: 'a1', role: 'reviewer', isPrimary: false, agent: agentA1 },
    { moduleId: 'm1', agentId: 'gone', role: 'x', isPrimary: false, agent: null },
  ]);
  readers.listAllModuleWorkflowBindings.mockResolvedValue([
    {
      moduleId: 'm1',
      workflowId: 'w1',
      eventType: 'module.completed',
      enabled: true,
      workflow: { id: 'w1', name: 'WF', slug: 'wf', isActive: true, hasPublishedVersion: true },
    },
  ]);
  readers.listAllModuleKnowledgeGrants.mockResolvedValue([
    { moduleId: 'm1', kind: 'document', entityId: 'd1', name: 'Doc', slug: 'doc', status: 'ready' },
    { moduleId: 'm1', kind: 'document', entityId: 'goneDoc', name: null, slug: null, status: null },
  ]);
  readers.listSlotDefinitions.mockResolvedValue([
    {
      slug: 'goal',
      group: 'goals',
      scope: 'module:reading',
      visibility: 'open',
      sensitivity: 'standard',
      dataType: 'text',
      isActive: true,
    },
    {
      slug: 'mood',
      group: 'wellbeing',
      scope: 'facilitation',
      visibility: 'hidden',
      sensitivity: 'sensitive',
      dataType: 'text',
      isActive: true,
    },
    {
      slug: 'name',
      group: 'identity',
      scope: 'global',
      visibility: 'open',
      sensitivity: 'standard',
      dataType: 'text',
      isActive: true,
    },
  ]);
  readers.listFacilitationBindings.mockResolvedValue([
    { role: 'onboarding', agentId: 'a2', agent: agentA2 },
  ]);
  readers.listFacilitationPolicies.mockResolvedValue([
    { id: 'p1', kind: 'auto_approval', enabled: true },
  ]);
  readers.getRegisteredFrameworkCapabilities.mockReturnValue([
    { slug: 'get_state' },
    { slug: 'fill_slot' },
  ]);
  readers.listPublishedMaps.mockResolvedValue([
    {
      slug: 'main',
      name: 'Main',
      version: 1,
      definition: {
        nodes: [
          { key: 'introReading', type: 'module', moduleSlug: 'reading' },
          { key: 'stage1', type: 'stage' },
        ],
        edges: [{ from: 'introReading', to: 'stage1', type: 'unlocks' }],
      },
    },
  ]);
}

const edgesOfKind = (edges: AtlasEdge[], kind: AtlasEdgeKind): AtlasEdge[] =>
  edges.filter((e) => e.kind === kind);

beforeEach(() => vi.clearAllMocks());

describe('assembleComposition', () => {
  it('projects modules with their code-registry detail (or degraded when the code is gone)', async () => {
    seedDeployment();
    const { modules } = await assembleComposition();

    const reading = modules.find((m) => m.id === 'reading');
    const writing = modules.find((m) => m.id === 'writing');
    expect(reading).toMatchObject({
      registeredInCode: true,
      description: 'Read stuff',
      agentRoles: ['companion', 'reviewer'],
    });
    // Retired module: row kept, but no code → degraded description/roles, not a crash.
    expect(writing).toMatchObject({ registeredInCode: false, description: null, agentRoles: [] });
  });

  it('dedups a cross-cutting agent to one entity and flags a tombstone', async () => {
    seedDeployment();
    readers.listFacilitationBindings.mockResolvedValue([
      { role: 'onboarding', agentId: 'a2', agent: { ...agentA2, deletedAt: new Date() } },
    ]);
    const { agents } = await assembleComposition();

    // a1 is bound into two modules but is ONE entity; a2 (facilitation) is tombstoned.
    expect(agents).toHaveLength(2);
    expect(agents.find((a) => a.id === 'a1')?.isTombstoned).toBe(false);
    expect(agents.find((a) => a.id === 'a2')?.isTombstoned).toBe(true);
  });

  it('emits every relationship as a typed edge and skips a vanished core row', async () => {
    seedDeployment();
    const { edges } = await assembleComposition();

    // module_agent: reading→a1, writing→a1 (the `gone` binding is dropped — no node to point at).
    const agentEdges = edgesOfKind(edges, 'module_agent');
    expect(agentEdges).toHaveLength(2);
    expect(agentEdges.every((e) => e.target.id !== 'gone')).toBe(true);
    expect(agentEdges.find((e) => e.source.id === 'reading')?.meta?.isPrimary).toBe(true);

    expect(edgesOfKind(edges, 'module_workflow')[0]).toMatchObject({
      label: 'module.completed',
      meta: { enabled: true },
    });
    // module_slot derives from scope=module:reading; the global slot owns no edge.
    expect(edgesOfKind(edges, 'module_slot')).toHaveLength(1);
    expect(edgesOfKind(edges, 'module_slot')[0].target.id).toBe('goal');
    // module_knowledge: the removed doc is skipped.
    expect(edgesOfKind(edges, 'module_knowledge')).toHaveLength(1);
    expect(edgesOfKind(edges, 'module_capability')[0].target.id).toBe('reading__save_worksheet');
    expect(edgesOfKind(edges, 'facilitation_agent')).toHaveLength(1);
    expect(edgesOfKind(edges, 'facilitation_slot')[0].target.id).toBe('mood');
    expect(edgesOfKind(edges, 'facilitation_capability')).toHaveLength(2);
    // map_module: only the module-typed place with a known moduleSlug.
    expect(edgesOfKind(edges, 'map_module')).toEqual([
      {
        kind: 'map_module',
        source: { type: 'mapNode', id: 'main::introReading' },
        target: { type: 'module', id: 'reading' },
      },
    ]);
  });

  it('builds the facilitation node with every declared seat and embedded policies', async () => {
    seedDeployment();
    const { facilitation, capabilities, knowledge, maps } = await assembleComposition();

    // All six seats enumerated; only `onboarding` is filled.
    expect(facilitation.seats).toHaveLength(6);
    expect(facilitation.seats.find((s) => s.role === 'onboarding')?.agentId).toBe('a2');
    expect(facilitation.seats.filter((s) => s.agentId === null)).toHaveLength(5);
    expect(facilitation.policies).toEqual([{ id: 'p1', kind: 'auto_approval', enabled: true }]);

    expect(capabilities).toHaveLength(3); // 2 framework + 1 module
    expect(knowledge).toHaveLength(1); // the removed doc produced no entity
    expect(maps[0].nodes).toHaveLength(2);
  });

  it('returns a valid empty-ish projection for a fresh deployment', async () => {
    readers.listModules.mockResolvedValue([]);
    readers.getRegisteredModule.mockReturnValue(undefined);
    readers.getRegisteredModules.mockReturnValue([]);
    readers.listAllModuleAgentBindings.mockResolvedValue([]);
    readers.listAllModuleWorkflowBindings.mockResolvedValue([]);
    readers.listAllModuleKnowledgeGrants.mockResolvedValue([]);
    readers.listSlotDefinitions.mockResolvedValue([]);
    readers.listFacilitationBindings.mockResolvedValue([]);
    readers.listFacilitationPolicies.mockResolvedValue([]);
    readers.getRegisteredFrameworkCapabilities.mockReturnValue([]);
    readers.listPublishedMaps.mockResolvedValue([]);

    const projection = await assembleComposition();

    expect(projection.modules).toEqual([]);
    expect(projection.agents).toEqual([]);
    expect(projection.edges).toEqual([]);
    // The facilitation node still lists its six declared (unfilled) seats.
    expect(projection.facilitation.seats).toHaveLength(6);
    expect(projection.facilitation.seats.every((s) => s.agentId === null)).toBe(true);
  });
});

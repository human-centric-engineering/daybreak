/**
 * Atlas composition assembler (f-atlas t-1) — composes the aggregate readers + the shipped
 * registry/definition reads into the one normalized {@link CompositionProjection}.
 *
 * The single place that knows the composition graph's shape. It fans out the reads in parallel,
 * maps `moduleId → slug`, dedups the cross-cutting entities (an agent bound into three modules is
 * ONE `AtlasAgent`), and emits every relationship as a typed {@link AtlasEdge}. It never mutates and
 * never writes — a pure projection (X8), so it cannot drift from reality.
 *
 * Degrade rules (an atlas of a live deployment must not 500 on one stale row): a binding whose core
 * row has vanished (`agent`/`workflow`/`knowledge` stitched to `null`) is dropped from the edges
 * (there is no node to point at) rather than surfaced as a dangling edge; a tombstoned-but-resolved
 * agent (`deletedAt` set) is KEPT (flagged `isTombstoned`) so a stale seat is visible for cleanup.
 */

import { listModules } from '@/lib/framework/modules/queries';
import { getRegisteredModule, getRegisteredModules } from '@/lib/framework/modules/registry';
import { moduleCapabilitySlug } from '@/lib/framework/modules/capabilities/namespace';
import { listSlotDefinitions } from '@/lib/framework/data-slots/queries';
import { SLOT_SCOPE, SLOT_SCOPE_MODULE_PREFIX } from '@/lib/framework/data-slots/vocabulary';
import { listFacilitationBindings } from '@/lib/framework/facilitation/agents/binding-queries';
import { FACILITATION_ROLE_VALUES } from '@/lib/framework/facilitation/agents/roles';
import { listFacilitationPolicies } from '@/lib/framework/facilitation/policies/policy-queries';
import { getRegisteredFrameworkCapabilities } from '@/lib/framework/capabilities/registry';
import {
  listAllModuleAgentBindings,
  listAllModuleWorkflowBindings,
  listAllModuleKnowledgeGrants,
  listPublishedMaps,
} from '@/lib/framework/atlas/queries';
import type {
  AtlasAgent,
  AtlasCapability,
  AtlasEdge,
  AtlasKnowledge,
  AtlasModule,
  AtlasSlot,
  AtlasWorkflow,
  CompositionProjection,
} from '@/lib/framework/atlas/view';

/** The singleton id of the facilitation node (there is exactly one). Safe as a bare literal — it is
 *  the id under the `facilitation` endpoint *type*, which is type-discriminated from module/agent ids. */
const FACILITATION_ID = 'facilitation';

/** A slot owned by a module declares `scope = "module:<slug>"`; this returns the `<slug>` or null.
 *  Uses the vocabulary's own prefix constant so the parse can't drift from the `moduleSlotScope` minter. */
function moduleSlugOfScope(scope: string): string | null {
  return scope.startsWith(SLOT_SCOPE_MODULE_PREFIX)
    ? scope.slice(SLOT_SCOPE_MODULE_PREFIX.length)
    : null;
}

/** The projection id of a knowledge grant (documents + tags share an id space otherwise). */
function knowledgeId(kind: 'document' | 'tag', entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Assemble the whole composition graph as a normalized projection. Reads are fanned out in
 * parallel; the registry reads (`getRegisteredModule(s)`, framework capabilities) are synchronous
 * in-memory lookups.
 */
export async function assembleComposition(): Promise<CompositionProjection> {
  const [
    moduleRows,
    agentBindings,
    workflowBindings,
    knowledgeGrants,
    slotDefs,
    facilitationBindings,
    policies,
    maps,
  ] = await Promise.all([
    listModules(),
    listAllModuleAgentBindings(),
    listAllModuleWorkflowBindings(),
    listAllModuleKnowledgeGrants(),
    listSlotDefinitions(),
    listFacilitationBindings(),
    listFacilitationPolicies(),
    listPublishedMaps(),
  ]);

  const slugByModuleId = new Map(moduleRows.map((m) => [m.id, m.slug]));
  const moduleSlugs = new Set(moduleRows.map((m) => m.slug));

  // ─── Entities ──────────────────────────────────────────────────────────────

  const modules: AtlasModule[] = moduleRows.map((m) => {
    const def = getRegisteredModule(m.slug);
    return {
      id: m.slug,
      name: m.name,
      status: m.status,
      audience: m.audience,
      isRegistered: m.isRegistered,
      registeredInCode: def !== undefined,
      description: def?.description ?? null,
      agentRoles: def?.agentRoles ?? [],
    };
  });

  // Agents are deduped across module bindings + facilitation seats. A stitched `null` agent (the
  // core row vanished) yields no entity and its edges are skipped.
  const agentsById = new Map<string, AtlasAgent>();
  const rememberAgent = (a: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    deletedAt: Date | null;
  }): void => {
    if (!agentsById.has(a.id)) {
      agentsById.set(a.id, {
        id: a.id,
        name: a.name,
        slug: a.slug,
        isActive: a.isActive,
        isTombstoned: a.deletedAt !== null,
      });
    }
  };
  for (const b of agentBindings) if (b.agent) rememberAgent(b.agent);
  for (const b of facilitationBindings) if (b.agent) rememberAgent(b.agent);

  // The stitched workflow shape (id/name/slug/isActive/hasPublishedVersion) IS `AtlasWorkflow`.
  const workflowsById = new Map<string, AtlasWorkflow>();
  for (const b of workflowBindings) {
    if (b.workflow && !workflowsById.has(b.workflow.id))
      workflowsById.set(b.workflow.id, b.workflow);
  }

  const slots: AtlasSlot[] = slotDefs.map((s) => ({
    id: s.slug,
    group: s.group,
    scope: s.scope,
    visibility: s.visibility,
    sensitivity: s.sensitivity,
    dataType: s.dataType,
    isActive: s.isActive,
  }));

  // Capabilities: framework built-ins + every registered module's declared (namespaced) tools.
  const capabilitiesById = new Map<string, AtlasCapability>();
  for (const cap of getRegisteredFrameworkCapabilities()) {
    capabilitiesById.set(cap.slug, { id: cap.slug, kind: 'framework' });
  }
  for (const def of getRegisteredModules()) {
    for (const cap of def.capabilities ?? []) {
      const id = moduleCapabilitySlug(def.slug, cap.slug);
      capabilitiesById.set(id, { id, kind: 'module' });
    }
  }

  // Knowledge grants → deduped document/tag entities (a removed core row is skipped).
  const knowledgeById = new Map<string, AtlasKnowledge>();
  for (const g of knowledgeGrants) {
    if (g.name === null || g.slug === null) continue;
    const id = knowledgeId(g.kind, g.entityId);
    if (!knowledgeById.has(id)) {
      knowledgeById.set(id, { id, kind: g.kind, name: g.name, slug: g.slug, status: g.status });
    }
  }

  // ─── Relationships ───────────────────────────────────────────────────────────

  const edges: AtlasEdge[] = [];

  for (const b of agentBindings) {
    const slug = slugByModuleId.get(b.moduleId);
    if (!slug || !b.agent) continue;
    edges.push({
      kind: 'module_agent',
      source: { type: 'module', id: slug },
      target: { type: 'agent', id: b.agent.id },
      label: b.role,
      meta: { isPrimary: b.isPrimary },
    });
  }

  for (const b of workflowBindings) {
    const slug = slugByModuleId.get(b.moduleId);
    if (!slug || !b.workflow) continue;
    edges.push({
      kind: 'module_workflow',
      source: { type: 'module', id: slug },
      target: { type: 'workflow', id: b.workflow.id },
      label: b.eventType,
      meta: { enabled: b.enabled },
    });
  }

  for (const g of knowledgeGrants) {
    const slug = slugByModuleId.get(g.moduleId);
    // Mirror the ENTITY guard (name AND slug non-null) exactly — otherwise a grant whose stitched
    // core row has a name but no slug would emit an edge to a knowledge node that was never created.
    if (!slug || g.name === null || g.slug === null) continue;
    edges.push({
      kind: 'module_knowledge',
      source: { type: 'module', id: slug },
      target: { type: 'knowledge', id: knowledgeId(g.kind, g.entityId) },
    });
  }

  // Module-owned slots: derived from the slot's `scope = module:<slug>` (only if that module exists).
  for (const s of slotDefs) {
    const owner = moduleSlugOfScope(s.scope);
    if (owner && moduleSlugs.has(owner)) {
      edges.push({
        kind: 'module_slot',
        source: { type: 'module', id: owner },
        target: { type: 'slot', id: s.slug },
      });
    }
  }

  // Module-declared capabilities (code registry → namespaced slug). Guard the module endpoint on
  // `moduleSlugs` like every other module-source edge: a module registered in code but with no
  // `framework_module` row yet (pre-sync / a failed boot sync) is absent from `modules[]`, so its
  // edge would dangle. The capability ENTITY is still built above (it is a real, code-owned tool).
  for (const def of getRegisteredModules()) {
    if (!moduleSlugs.has(def.slug)) continue;
    for (const cap of def.capabilities ?? []) {
      edges.push({
        kind: 'module_capability',
        source: { type: 'module', id: def.slug },
        target: { type: 'capability', id: moduleCapabilitySlug(def.slug, cap.slug) },
      });
    }
  }

  // Facilitation layer: seats → agents, its scope slots, its framework capabilities.
  const facilitationAgentByRole = new Map(facilitationBindings.map((b) => [b.role, b.agent]));
  for (const b of facilitationBindings) {
    if (!b.agent) continue;
    edges.push({
      kind: 'facilitation_agent',
      source: { type: 'facilitation', id: FACILITATION_ID },
      target: { type: 'agent', id: b.agent.id },
      label: b.role,
    });
  }
  for (const s of slotDefs) {
    if (s.scope === SLOT_SCOPE.facilitation) {
      edges.push({
        kind: 'facilitation_slot',
        source: { type: 'facilitation', id: FACILITATION_ID },
        target: { type: 'slot', id: s.slug },
      });
    }
  }
  for (const cap of getRegisteredFrameworkCapabilities()) {
    edges.push({
      kind: 'facilitation_capability',
      source: { type: 'facilitation', id: FACILITATION_ID },
      target: { type: 'capability', id: cap.slug },
    });
  }

  // Map places that bind a module → the module entity.
  for (const map of maps) {
    if (!map.definition) continue;
    for (const node of map.definition.nodes) {
      if (node.type === 'module' && node.moduleSlug && moduleSlugs.has(node.moduleSlug)) {
        edges.push({
          kind: 'map_module',
          source: { type: 'mapNode', id: `${map.slug}::${node.key}` },
          target: { type: 'module', id: node.moduleSlug },
        });
      }
    }
  }

  // ─── Facilitation node (seats enumerate every declared role; policies embedded) ──────────────

  const facilitation = {
    seats: FACILITATION_ROLE_VALUES.map((role) => ({
      role,
      agentId: facilitationAgentByRole.get(role)?.id ?? null,
    })),
    policies: policies.map((p) => ({ id: p.id, kind: p.kind, enabled: p.enabled })),
  };

  return {
    modules,
    facilitation,
    agents: [...agentsById.values()],
    workflows: [...workflowsById.values()],
    slots,
    capabilities: [...capabilitiesById.values()],
    knowledge: [...knowledgeById.values()],
    maps: maps.map((m) => ({
      id: m.slug,
      name: m.name,
      version: m.version,
      nodes: (m.definition?.nodes ?? []).map((n) => ({
        key: n.key,
        type: n.type,
        moduleSlug: n.moduleSlug ?? null,
        region: n.region ?? null,
      })),
      edges: (m.definition?.edges ?? []).map((e) => ({ from: e.from, to: e.to, type: e.type })),
    })),
    edges,
  };
}

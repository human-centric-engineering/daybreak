/**
 * Pure mapper: the atlas `CompositionProjection` → the `@xyflow/react` `nodes` / `edges` the
 * read-only canvas draws (f-atlas t-2a). The composition analogue of the explorer's
 * `journey-mapper.ts` and the map editor's `map-mappers.ts` — intentionally free of React / React
 * Flow *runtime* imports (types only) so the layout unit-tests without a DOM.
 *
 * The projection is normalized (entities + typed-endpoint edges); this turns each entity into ONE
 * node and each relationship into ONE edge, with a **hub-and-spoke** layout: the primaries (modules,
 * the facilitation layer, published maps) sit on a top row, and each satellite (agent / workflow /
 * slot / capability / knowledge) is stacked under the first primary that references it (a shared
 * satellite — e.g. an agent bound into three modules — is placed once; its other links just draw
 * across). Node ids are `"<type>:<id>"` so the projection's cross-type id space (a slot slug could
 * equal an agent id) can't collide on the canvas — the same discriminated-endpoint guarantee the
 * projection documents. Deep-links are resolved here into each node's `data.href` (null ⇒ no editor
 * yet), so the node component and the click handler share one source of truth.
 */

import type { Edge, Node } from '@xyflow/react';

import type {
  AtlasEndpoint,
  AtlasEntityType,
  CompositionProjection,
} from '@/lib/framework/atlas/view';

/** The data payload the custom `AtlasNode` renders. */
export interface AtlasNodeData extends Record<string, unknown> {
  kind: AtlasEntityType;
  /** Primary label (a name/slug/role). */
  label: string;
  /** Secondary line (slug, status, scope…), optional. */
  sublabel?: string;
  /** Deep-link to the real editor, or null when none exists yet (map/slot/facilitation degrade). */
  href: string | null;
  /** A small status pill (e.g. "unpublished", "sensitive", "removed"). */
  badge?: string;
  /** Lens state (t-3), set by `applyFocus`: `dimmed` = outside the focused subgraph; `focused` = the
   *  lens subject itself. Both default to unset (no lens active). */
  dimmed?: boolean;
  focused?: boolean;
}

export type AtlasFlowNode = Node<AtlasNodeData, 'atlas'>;

/** Node id on the canvas — `"<type>:<id>"`, unique across the projection's per-type id spaces. */
export function atlasNodeId(type: AtlasEntityType, id: string): string {
  return `${type}:${id}`;
}

const endpointNodeId = (e: AtlasEndpoint): string => atlasNodeId(e.type, e.id);

/**
 * The real editor a node deep-links to, or null when none exists. agent/workflow/module/map have
 * dedicated editors; capability/knowledge land on their (list) admin pages; slot + the facilitation
 * layer have no editor yet, so they degrade to an honest non-link (X8: navigate, never edit-in-place).
 */
export function atlasDeepLink(type: AtlasEntityType, id: string): string | null {
  switch (type) {
    case 'module':
      return `/admin/framework/modules/${id}`;
    case 'map':
      return `/admin/framework/maps/${id}`;
    case 'agent':
      return `/admin/orchestration/agents/${id}`;
    case 'workflow':
      return `/admin/orchestration/workflows/${id}`;
    case 'capability':
      return '/admin/orchestration/capabilities';
    case 'knowledge':
      return '/admin/orchestration/knowledge';
    case 'slot':
    case 'facilitation':
    case 'mapNode':
      return null;
  }
}

// ─── Layout constants ────────────────────────────────────────────────────────
const PRIMARY_GAP_X = 340; // horizontal space per primary (wide enough for a satellite stack)
const PRIMARY_Y = 0;
const SATELLITE_TOP_Y = 150; // first satellite row, below the primary row
const SATELLITE_GAP_Y = 84;
const SATELLITE_INDENT_X = 24; // nudge satellites right of their primary's left edge

/** Build the node payload for one entity (the projection stores structural fields only). */
function nodeData(
  kind: AtlasEntityType,
  label: string,
  id: string,
  extra?: Partial<AtlasNodeData>
): AtlasNodeData {
  return { kind, label, href: atlasDeepLink(kind, id), ...extra };
}

/**
 * Convert a composition projection into canvas nodes + edges. Deterministic (no clock/random), so
 * the same projection always lays out identically and the mapper is unit-testable.
 */
export function compositionToFlow(projection: CompositionProjection): {
  nodes: AtlasFlowNode[];
  edges: Edge[];
} {
  // 1. Assemble every entity's node data, keyed by canvas node id.
  const dataById = new Map<string, AtlasNodeData>();
  const put = (type: AtlasEntityType, id: string, data: AtlasNodeData): void => {
    dataById.set(atlasNodeId(type, id), data);
  };

  for (const m of projection.modules) {
    put(
      'module',
      m.id,
      nodeData('module', m.name, m.id, {
        sublabel: m.id,
        badge: m.isRegistered ? undefined : 'retired',
      })
    );
  }
  put('facilitation', 'facilitation', nodeData('facilitation', 'Facilitation', 'facilitation'));
  for (const a of projection.agents) {
    put(
      'agent',
      a.id,
      nodeData('agent', a.name, a.id, {
        sublabel: a.slug,
        badge: a.isTombstoned ? 'removed' : a.isActive ? undefined : 'inactive',
      })
    );
  }
  for (const w of projection.workflows) {
    put(
      'workflow',
      w.id,
      nodeData('workflow', w.name, w.id, {
        sublabel: w.slug,
        badge: w.hasPublishedVersion ? undefined : 'unpublished',
      })
    );
  }
  for (const s of projection.slots) {
    put(
      'slot',
      s.id,
      nodeData('slot', s.id, s.id, {
        sublabel: s.group,
        badge: s.sensitivity !== 'standard' ? s.sensitivity : undefined,
      })
    );
  }
  for (const c of projection.capabilities) {
    put('capability', c.id, nodeData('capability', c.id, c.id, { sublabel: c.kind }));
  }
  for (const k of projection.knowledge) {
    put('knowledge', k.id, nodeData('knowledge', k.name, k.id, { sublabel: k.kind }));
  }
  for (const map of projection.maps) {
    put(
      'map',
      map.id,
      nodeData('map', map.name, map.id, {
        sublabel: map.id,
        badge: map.version === null ? 'unpublished' : `v${map.version}`,
      })
    );
  }

  // 2. Resolve edges to canvas endpoints. A `map_module` edge sources from a mapNode
  //    (`mapNode:<slug>::<key>`) — collapse it to the map node (`map:<slug>`) and dedup, so the
  //    atlas shows "this map uses these modules" without redrawing the map's internal topology.
  const flowEdges: Edge[] = [];
  const seenEdge = new Set<string>();
  for (const e of projection.edges) {
    let sourceId: string;
    if (e.kind === 'map_module') {
      const mapSlug = e.source.id.split('::')[0]; // "<slug>::<nodeKey>" → "<slug>"
      sourceId = atlasNodeId('map', mapSlug);
    } else {
      sourceId = endpointNodeId(e.source);
    }
    const targetId = endpointNodeId(e.target);

    // Both endpoints must be real nodes; skip a dangling edge defensively (t-1 already guards these).
    if (!dataById.has(sourceId) || !dataById.has(targetId)) continue;

    // The label is part of the identity: an agent bound to one module under two roles (or a workflow
    // under two eventTypes) is TWO distinct edges, and each React Flow edge needs a unique id. Only
    // `map_module` (labelless — every place resolves to '') collapses to one map→module edge.
    const key = `${e.kind}:${sourceId}->${targetId}:${e.label ?? ''}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);

    flowEdges.push({
      id: key,
      source: sourceId,
      target: targetId,
      ...(e.label ? { label: e.label } : {}),
    });
  }

  // 3. Lay out: primaries on a row, satellites stacked under the first primary that references them.
  const primaryIds = [
    ...projection.modules.map((m) => atlasNodeId('module', m.id)),
    atlasNodeId('facilitation', 'facilitation'),
    ...projection.maps.map((m) => atlasNodeId('map', m.id)),
  ];
  const primaryIndex = new Map(primaryIds.map((id, i) => [id, i]));
  const positioned = new Map<string, { x: number; y: number }>();

  primaryIds.forEach((id, i) => positioned.set(id, { x: i * PRIMARY_GAP_X, y: PRIMARY_Y }));

  // Walk edges in order; the first primary→satellite edge places the satellite under that primary.
  const stackDepth = new Map<string, number>(); // per-primary count of satellites placed so far
  for (const e of flowEdges) {
    const owner = primaryIndex.get(e.source);
    if (owner === undefined) continue; // only primary-sourced edges anchor a satellite
    if (positioned.has(e.target)) continue; // already placed (shared satellite or a primary)
    const depth = stackDepth.get(e.source) ?? 0;
    stackDepth.set(e.source, depth + 1);
    positioned.set(e.target, {
      x: owner * PRIMARY_GAP_X + SATELLITE_INDENT_X,
      y: SATELLITE_TOP_Y + depth * SATELLITE_GAP_Y,
    });
  }

  // Any entity never referenced by an edge (an orphan slot/capability/agent) — park it in a trailing
  // column so it is still visible rather than stacked at the origin.
  let orphanRow = 0;
  const orphanX = (primaryIds.length + 1) * PRIMARY_GAP_X;
  const nodes: AtlasFlowNode[] = [];
  for (const [id, data] of dataById) {
    let pos = positioned.get(id);
    if (!pos) {
      pos = { x: orphanX, y: PRIMARY_Y + orphanRow * SATELLITE_GAP_Y };
      orphanRow += 1;
    }
    nodes.push({ id, type: 'atlas', position: pos, data });
  }

  return { nodes, edges: flowEdges };
}

/**
 * The four facilitation-map edge kinds, as an editor-facing registry (f-map-editor
 * t-2). One entry per `EDGE_TYPES` value in the map schema (`prerequisite` /
 * `unlocks` / `tangent` / `related_to`) carrying the inspector label, a one-line
 * description, and the stroke styling the custom edge component + inspector share so
 * a colour change is a single edit.
 *
 * Structural edges (`prerequisite` / `unlocks`) drive availability, so they render
 * solid; advisory edges (`tangent` / `related_to`) render dashed — matching the
 * read-only journey explorer's convention (`journey-mapper.ts`). Client-safe: a plain
 * data table, no server imports.
 */

import { EDGE_TYPES, type EdgeType } from '@/lib/framework/facilitation/map/schema';

export interface MapEdgeKind {
  type: EdgeType;
  label: string;
  description: string;
  /** Whether the edge drives availability (solid) or is advisory (dashed). */
  structural: boolean;
  /** Stroke colour (light-mode hex; the edge is theme-neutral enough to reuse in dark). */
  stroke: string;
  /** `strokeDasharray` for advisory edges; `undefined` for a solid stroke. */
  dash?: string;
}

const KIND_BY_TYPE: Record<EdgeType, Omit<MapEdgeKind, 'type'>> = {
  prerequisite: {
    label: 'Prerequisite',
    description: 'The source must be complete before the target unlocks.',
    structural: true,
    stroke: '#6366f1', // indigo-500
  },
  unlocks: {
    label: 'Unlocks',
    description: 'Completing the source opens the target.',
    structural: true,
    stroke: '#0ea5e9', // sky-500
  },
  tangent: {
    label: 'Tangent',
    description: 'An optional side path off the source — advisory, not gating.',
    structural: false,
    stroke: '#f59e0b', // amber-500
    dash: '6 4',
  },
  related_to: {
    label: 'Related to',
    description: 'A loose association between two places — advisory, not gating.',
    structural: false,
    stroke: '#a1a1aa', // zinc-400
    dash: '4 4',
  },
};

/** The kinds in inspector display order (the schema's `EDGE_TYPES` order). */
export const MAP_EDGE_KINDS: readonly MapEdgeKind[] = EDGE_TYPES.map((type) => ({
  type,
  ...KIND_BY_TYPE[type],
}));

/** Look up one kind's presentation by edge type. */
export function mapEdgeKind(type: EdgeType): MapEdgeKind {
  return { type, ...KIND_BY_TYPE[type] };
}

/** The default edge type a freshly-drawn connection gets (decision 6: draw-then-inspect). */
export const DEFAULT_EDGE_TYPE: EdgeType = 'prerequisite';

/**
 * The four facilitation-map node kinds, as an editor-facing registry (f-map-editor
 * t-1). One entry per `NodeType` in the map schema (`module` / `stage` / `milestone`
 * / `region`) carrying the palette label, a one-line description, an icon, and the
 * Tailwind classes the palette block + canvas node share so a colour change is a
 * single edit.
 *
 * Client-safe: a plain data table over `lucide-react` icons only (no server code),
 * so both the `'use client'` palette and node components import it directly. The
 * map schema (`NODE_TYPES`) stays the source of truth for the vocabulary; this only
 * decorates it for the canvas.
 */

import { Boxes, Flag, Layers, Milestone, type LucideIcon } from 'lucide-react';

import { NODE_TYPES, type NodeType } from '@/lib/framework/facilitation/map/schema';

export interface MapNodeKind {
  type: NodeType;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the block/node surface (bg + border + text). */
  surface: string;
  /** Tailwind classes for the small icon chip. */
  iconChip: string;
}

const KIND_BY_TYPE: Record<NodeType, Omit<MapNodeKind, 'type'>> = {
  module: {
    label: 'Module',
    description: 'A place bound to a registered module — where a user does the work.',
    icon: Boxes,
    surface:
      'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100',
    iconChip: 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100',
  },
  stage: {
    label: 'Stage',
    description: 'A maturity marker grouping the places that belong to one level.',
    icon: Layers,
    surface:
      'bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-100',
    iconChip: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-100',
  },
  milestone: {
    label: 'Milestone',
    description: 'A one-off achievement other nodes can gate on.',
    icon: Milestone,
    surface:
      'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100',
    iconChip: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  },
  region: {
    label: 'Region',
    description: 'A container that groups member nodes (collapse/expand lands in t-2).',
    icon: Flag,
    surface:
      'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100',
    iconChip: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  },
};

/** The kinds in palette display order (the schema's `NODE_TYPES` order). */
export const MAP_NODE_KINDS: readonly MapNodeKind[] = NODE_TYPES.map((type) => ({
  type,
  ...KIND_BY_TYPE[type],
}));

/** Look up one kind's presentation by node type. */
export function mapNodeKind(type: NodeType): MapNodeKind {
  return { type, ...KIND_BY_TYPE[type] };
}

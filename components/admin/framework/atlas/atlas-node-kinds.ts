/**
 * The atlas composition node kinds, as a client-safe presentation registry (f-atlas t-2a) — one
 * entry per `AtlasEntityType` carrying a lucide icon, a legend label, and the Tailwind classes the
 * canvas node + the legend share so a colour change is a single edit. Mirrors the map editor's
 * `map-node-kinds.ts`.
 *
 * A plain data table over `lucide-react` icons only (no server code), so both the `'use client'`
 * node component and the legend import it directly. `AtlasEntityType` (from `atlas/view.ts`) stays
 * the source of truth for the vocabulary; this only decorates it.
 */

import {
  Bot,
  BookOpen,
  Boxes,
  Compass,
  Map as MapIcon,
  MapPin,
  Tag,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { AtlasEntityType } from '@/lib/framework/atlas/view';

export interface AtlasNodeKind {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the node surface (bg + border + text). */
  surface: string;
  /** Tailwind classes for the small icon chip. */
  iconChip: string;
}

const KIND_BY_TYPE: Record<AtlasEntityType, AtlasNodeKind> = {
  module: {
    label: 'Module',
    icon: Boxes,
    surface:
      'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100',
    iconChip: 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100',
  },
  facilitation: {
    label: 'Facilitation',
    icon: Compass,
    surface:
      'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-900 dark:bg-fuchsia-950/40 dark:border-fuchsia-800 dark:text-fuchsia-100',
    iconChip: 'bg-fuchsia-200 text-fuchsia-800 dark:bg-fuchsia-800 dark:text-fuchsia-100',
  },
  agent: {
    label: 'Agent',
    icon: Bot,
    surface:
      'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100',
    iconChip: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  },
  workflow: {
    label: 'Workflow',
    icon: Workflow,
    surface:
      'bg-indigo-50 border-indigo-300 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-100',
    iconChip: 'bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100',
  },
  slot: {
    label: 'Slot',
    icon: Tag,
    surface:
      'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100',
    iconChip: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  },
  capability: {
    label: 'Capability',
    icon: Wrench,
    surface:
      'bg-cyan-50 border-cyan-300 text-cyan-900 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-100',
    iconChip: 'bg-cyan-200 text-cyan-800 dark:bg-cyan-800 dark:text-cyan-100',
  },
  knowledge: {
    label: 'Knowledge',
    icon: BookOpen,
    surface:
      'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-100',
    iconChip: 'bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-100',
  },
  map: {
    label: 'Map',
    icon: MapIcon,
    surface:
      'bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-100',
    iconChip: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-100',
  },
  mapNode: {
    label: 'Map place',
    icon: MapPin,
    surface:
      'bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-100',
    iconChip: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-100',
  },
};

/** Look up one kind's presentation. */
export function atlasNodeKind(type: AtlasEntityType): AtlasNodeKind {
  return KIND_BY_TYPE[type];
}

/** The kinds the atlas actually draws as nodes, in legend order (mapNode is collapsed into `map`). */
export const ATLAS_LEGEND_KINDS: readonly AtlasEntityType[] = [
  'module',
  'facilitation',
  'agent',
  'workflow',
  'slot',
  'capability',
  'knowledge',
  'map',
];

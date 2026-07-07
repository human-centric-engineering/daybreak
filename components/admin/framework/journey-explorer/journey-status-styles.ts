/**
 * The single source of truth for journey node-status colours (f-ops-views t-5b).
 *
 * A node's status is painted in two places — the canvas node's border/fill
 * ({@link JourneyNode}) and the explorer's legend dot ({@link JourneyExplorer}). They
 * held separate colour maps, a silent-drift trap (change one green, forget the other);
 * both now derive from here, so the legend and the nodes can't disagree. Keyed by the
 * shared `NODE_STATE_STATUS` vocabulary; an unknown/absent status (X1) falls back to
 * `unvisited` at the call site.
 */

import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

export interface JourneyStatusStyle {
  /** Human label for the legend. */
  label: string;
  /** Legend dot background class. */
  dot: string;
  /** Canvas node border + fill (light + dark) classes. */
  node: string;
}

export const JOURNEY_STATUS_STYLES: Record<string, JourneyStatusStyle> = {
  [NODE_STATE_STATUS.completed]: {
    label: 'Completed',
    dot: 'bg-green-500',
    node: 'border-green-500 bg-green-50 dark:border-green-500 dark:bg-green-950/40',
  },
  [NODE_STATE_STATUS.active]: {
    label: 'Active',
    dot: 'bg-amber-500',
    node: 'border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/40',
  },
  [NODE_STATE_STATUS.available]: {
    label: 'Available',
    dot: 'bg-blue-400',
    node: 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40',
  },
  [NODE_STATE_STATUS.visited]: {
    label: 'Visited',
    dot: 'bg-slate-400',
    node: 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-900/60',
  },
  [NODE_STATE_STATUS.unvisited]: {
    label: 'Unvisited',
    dot: 'bg-muted-foreground/30',
    node: 'border-border bg-background',
  },
};

/** The neutral fallback style for an unknown/absent status. */
export const UNVISITED_STATUS_STYLE = JOURNEY_STATUS_STYLES[NODE_STATE_STATUS.unvisited];

/** Legend display order (most-progressed → least). */
export const JOURNEY_STATUS_ORDER: string[] = [
  NODE_STATE_STATUS.completed,
  NODE_STATE_STATUS.active,
  NODE_STATE_STATUS.available,
  NODE_STATE_STATUS.visited,
  NODE_STATE_STATUS.unvisited,
];

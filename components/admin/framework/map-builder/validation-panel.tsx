'use client';

/**
 * ValidationPanel (f-map-editor t-3) — the live-preflight error strip beneath the
 * canvas. It lists the issues the pure validators raise as the author works
 * (`collectMapIssues` → duplicate keys, dangling endpoints, region + prerequisite
 * cycles, unreachable nodes), each clickable to select the node it points at (the
 * matching node also wears a red ring, painted by `MapNode` off `data.hasError`).
 *
 * Renders nothing when the map is clean, so it costs no vertical space until there is
 * something to fix. The authoritative gate is still the publish 400 (t-4); this is the
 * fast, inline heads-up before that round-trip.
 */

import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MapEditorIssue } from '@/components/admin/framework/map-builder/map-validation';

export interface ValidationPanelProps {
  issues: readonly MapEditorIssue[];
  /** Select the node an issue points at (the first of its node keys). */
  onSelectNode: (nodeId: string) => void;
}

export function ValidationPanel({ issues, onSelectNode }: ValidationPanelProps) {
  if (issues.length === 0) return null;

  return (
    <section
      data-testid="map-validation-panel"
      aria-label="Map validation issues"
      className="max-h-40 shrink-0 overflow-y-auto border-t border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900 dark:bg-amber-950/40"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        {issues.length} validation {issues.length === 1 ? 'issue' : 'issues'}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {issues.map((issue, i) => {
          const target = issue.nodeKeys[0];
          const content = (
            <>
              <span className="rounded bg-amber-200/70 px-1 py-0.5 font-mono text-[10px] tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                {issue.code}
              </span>
              <span className="text-amber-900 dark:text-amber-100">{issue.message}</span>
            </>
          );
          return (
            <li key={`${issue.code}-${i}`} className="text-[11px] leading-snug">
              {target ? (
                <button
                  type="button"
                  data-testid={`map-issue-${i}`}
                  onClick={() => onSelectNode(target)}
                  className={cn(
                    'flex items-start gap-1.5 rounded px-1 py-0.5 text-left',
                    'hover:bg-amber-200/60 dark:hover:bg-amber-900/50'
                  )}
                >
                  {content}
                </button>
              ) : (
                <span
                  data-testid={`map-issue-${i}`}
                  className="flex items-start gap-1.5 px-1 py-0.5"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

'use client';

/**
 * Journey explorer (f-ops-views t-5b) — the detail view an operator uses to inspect
 * one user's traversal of a facilitation map. It lays the published map out as a
 * read-only canvas ({@link JourneyCanvas}) and colours each node by the user's
 * journey status, in one of two modes:
 *
 * - **Live** — the current `UserNodeState` projection (where the user stands now).
 * - **Replay** — the status reconstructed from the event log up to a scrubber index,
 *   so an operator can step through how the user got there. Pure client reduction
 *   over the timeline the detail endpoint already returned (no extra fetch).
 *
 * Degrades honestly: no published map structure ⇒ a notice, not a fake empty canvas;
 * an empty timeline ⇒ replay disabled with an explanation.
 */

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { JourneyDetailView } from '@/lib/framework/facilitation/journey/view';
import { JourneyCanvas } from '@/components/admin/framework/journey-explorer/journey-canvas';
import {
  layoutJourney,
  liveStatuses,
  replayStatuses,
  toFlowNodes,
} from '@/components/admin/framework/journey-explorer/journey-mapper';
import {
  JOURNEY_STATUS_STYLES,
  JOURNEY_STATUS_ORDER,
} from '@/components/admin/framework/journey-explorer/journey-status-styles';

type Mode = 'live' | 'replay';

/** Deterministic UTC `YYYY-MM-DD HH:MM:SS` for an ISO string (hydration-safe). */
function formatInstant(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 19).replace('T', ' ')}Z`;
}

// Legend derives from the shared status-style map, so a colour change is one edit.
const LEGEND = JOURNEY_STATUS_ORDER.map((status) => ({
  status,
  label: JOURNEY_STATUS_STYLES[status].label,
  dot: JOURNEY_STATUS_STYLES[status].dot,
}));

interface JourneyExplorerProps {
  detail: JourneyDetailView;
}

export function JourneyExplorer({ detail }: JourneyExplorerProps) {
  const { journey, graph, nodeStates, timeline } = detail;

  const [mode, setMode] = useState<Mode>('live');
  const [replayIndex, setReplayIndex] = useState(Math.max(0, timeline.length - 1));

  const structure = graph?.structure ?? null;
  const layout = useMemo(() => (structure ? layoutJourney(structure) : null), [structure]);

  const { statusByNode, currentNodeKey } = useMemo(() => {
    if (mode === 'replay' && timeline.length > 0) {
      return replayStatuses(timeline, replayIndex);
    }
    return { statusByNode: liveStatuses(nodeStates), currentNodeKey: null };
  }, [mode, replayIndex, timeline, nodeStates]);

  const nodes = useMemo(
    () => (layout ? toFlowNodes(layout.baseNodes, statusByNode, currentNodeKey) : []),
    [layout, statusByNode, currentNodeKey]
  );

  const canReplay = timeline.length > 0;
  const currentEvent = mode === 'replay' && canReplay ? timeline[replayIndex] : null;

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{graph?.name ?? 'Unknown map'}</h1>
          <Badge variant="outline" className="font-mono text-xs">
            {journey.graphSlug}
          </Badge>
          {journey.contextKey && (
            <Badge variant="secondary" className="text-xs">
              context: {journey.contextKey}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          User <span className="font-mono">{journey.userId}</span> · started{' '}
          {formatInstant(journey.startedAt)}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="View mode">
            <Button
              size="sm"
              variant={mode === 'live' ? 'default' : 'ghost'}
              onClick={() => setMode('live')}
            >
              Live
            </Button>
            <Button
              size="sm"
              variant={mode === 'replay' ? 'default' : 'ghost'}
              onClick={() => setMode('replay')}
              disabled={!canReplay}
            >
              Replay
            </Button>
          </div>
          {mode === 'live' ? (
            <span className="text-muted-foreground text-sm">Current state.</span>
          ) : (
            <span className="text-muted-foreground text-sm">
              Stepping the event log ({timeline.length} events).
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LEGEND.map((l) => (
            <span
              key={l.status}
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${l.dot}`} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {mode === 'replay' && canReplay && (
        <div className="bg-muted/40 space-y-3 rounded-md border p-4">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReplayIndex((i) => Math.max(0, i - 1))}
              disabled={replayIndex <= 0}
            >
              Prev
            </Button>
            <input
              type="range"
              min={0}
              max={timeline.length - 1}
              value={replayIndex}
              onChange={(e) => setReplayIndex(Number(e.target.value))}
              className="flex-1"
              aria-label="Replay position"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReplayIndex((i) => Math.min(timeline.length - 1, i + 1))}
              disabled={replayIndex >= timeline.length - 1}
            >
              Next
            </Button>
          </div>
          {currentEvent && (
            <p className="text-sm">
              <span className="text-muted-foreground">
                Event {replayIndex + 1} of {timeline.length}:
              </span>{' '}
              <span className="font-medium">{currentEvent.type}</span>
              {currentEvent.nodeKey && (
                <>
                  {' '}
                  · node <span className="font-mono">{currentEvent.nodeKey}</span>
                </>
              )}{' '}
              ·{' '}
              <span className="text-muted-foreground">
                {formatInstant(currentEvent.occurredAt)}
              </span>
            </p>
          )}
        </div>
      )}

      {layout ? (
        <JourneyCanvas nodes={nodes} edges={layout.edges} />
      ) : (
        <p className="text-muted-foreground rounded-md border p-8 text-center text-sm" role="alert">
          This map has no published version to lay out (or its structure couldn&rsquo;t be loaded),
          so the traversal can&rsquo;t be drawn. The event timeline below still reflects the
          user&rsquo;s activity.
        </p>
      )}

      {nodeStates.length === 0 && timeline.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No recorded activity on this journey yet — the user has started it but not entered a node.
        </p>
      )}
    </div>
  );
}

'use client';

/**
 * MapHeatView (f-engagement-analytics t-1b) — the collective heat overlay an operator
 * uses to see how ALL users flow through a map: per-node traffic and drop-off laid out
 * over the published structure, derived from the insert-only event stream (A9).
 *
 * It reuses the read-only {@link JourneyCanvas} (the shared facilitation-map canvas) with
 * its own heat `nodeTypes` + an `overlay` panel carrying the metric toggle and legend —
 * the host hook f-ops-views promised. A metric switch recolours the same layout between
 * **traffic** (distinct users) and **drop-off**; every node shows both raw figures
 * regardless, so the toggle only changes the colour basis.
 *
 * Degrades honestly: no published structure ⇒ a notice, not a fake canvas; a structure
 * with no recorded activity ⇒ the map renders all-neutral (legitimate zero, distinct from
 * a load failure, which the server page handles before this renders).
 */

import { useMemo, useState } from 'react';

import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';
import type { MapHeat } from '@/lib/framework/engagement/map-heat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JourneyCanvas } from '@/components/admin/framework/journey-explorer/journey-canvas';
import { toHeatFlow } from '@/components/admin/framework/map-heat/map-heat-mapper';
import { mapHeatNodeTypes } from '@/components/admin/framework/map-heat/map-heat-node';
import {
  type HeatMetric,
  METRIC_LABELS,
  legendEntries,
} from '@/components/admin/framework/map-heat/map-heat-styles';

interface MapHeatViewProps {
  graphName: string;
  graphSlug: string;
  /** The published map structure, or null when nothing is published / it didn't parse. */
  structure: MapDefinition | null;
  heat: MapHeat;
}

const METRICS: HeatMetric[] = ['traffic', 'dropoff'];

export function MapHeatView({ graphName, graphSlug, structure, heat }: MapHeatViewProps) {
  const [metric, setMetric] = useState<HeatMetric>('traffic');

  // Layout depends only on the structure; recolour (metric) is a cheap re-fold on top.
  const flow = useMemo(
    () => (structure ? toHeatFlow(structure, heat, metric) : null),
    [structure, heat, metric]
  );

  const overlay = (
    <div className="bg-background/90 space-y-2 rounded-md border p-3 shadow-sm backdrop-blur">
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Heat metric">
        {METRICS.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={metric === m ? 'default' : 'ghost'}
            onClick={() => setMetric(m)}
          >
            {METRIC_LABELS[m]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Low</span>
        {legendEntries(metric).map((e) => (
          <span
            key={e.bucket}
            className={`inline-block h-3 w-5 rounded-sm border ${e.className}`}
            aria-hidden
          />
        ))}
        <span className="text-muted-foreground text-xs">High</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="bg-background sticky top-0 z-30 -mx-6 border-b px-6 pt-3 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{graphName}</h1>
          <Badge variant="outline" className="font-mono text-xs">
            {graphSlug}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            collective heat
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          How every user has travelled this map — per-node traffic and drop-off, derived from the
          engagement event stream. Colour follows the selected metric; each node shows both.
        </p>
      </header>

      {flow ? (
        <JourneyCanvas
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={mapHeatNodeTypes}
          overlay={overlay}
        />
      ) : (
        <p className="text-muted-foreground rounded-md border p-8 text-center text-sm" role="alert">
          This map has no published version to lay out (or its structure couldn&rsquo;t be loaded),
          so collective heat can&rsquo;t be drawn. Publish a version, then user activity will show
          here.
        </p>
      )}
    </div>
  );
}

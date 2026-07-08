'use client';

/**
 * EdgeInspector (f-map-editor t-2 / t-3) — the right-panel inspector for a selected
 * edge. Shows the connection (source → target), lets the author pick one of the four
 * edge types, compose a gating condition (the t-3 descriptor-driven
 * `<ConditionBuilder>`), and delete the edge. Mirrors the node-inspector's shape.
 *
 * Gating conditions ride on an edge (`data.condition`). The condition builder is keyed
 * on the edge id so its working state re-seeds cleanly each time a different edge is
 * selected.
 */

import { ArrowRight, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DEFAULT_EDGE_TYPE,
  MAP_EDGE_KINDS,
} from '@/components/admin/framework/map-builder/map-edge-kinds';
import { ConditionBuilder } from '@/components/admin/framework/map-builder/condition-builder';
import type { MapFlowEdge } from '@/components/admin/framework/map-builder/map-mappers';
import type { EdgeType, MapCondition } from '@/lib/framework/facilitation/map/schema';

export interface EdgeInspectorProps {
  edge: MapFlowEdge;
  /** Node keys on the canvas — suggestions for a `state`-family condition's milestone. */
  nodeKeys: readonly string[];
  /** Registered slot-definition slugs — suggestions for a `slot`-family condition. */
  slotOptions: readonly string[];
  onTypeChange: (edgeId: string, type: EdgeType) => void;
  onConditionChange: (edgeId: string, condition: MapCondition | undefined) => void;
  onDelete: (edgeId: string) => void;
}

export function EdgeInspector({
  edge,
  nodeKeys,
  slotOptions,
  onTypeChange,
  onConditionChange,
  onDelete,
}: EdgeInspectorProps) {
  const currentType = edge.data?.edgeType ?? DEFAULT_EDGE_TYPE;

  return (
    <aside
      data-testid="map-edge-panel"
      className="bg-background flex h-full w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4"
    >
      <div>
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Edge
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium break-all">
          <span className="font-mono">{edge.source}</span>
          <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-label="to" />
          <span className="font-mono">{edge.target}</span>
        </p>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs">Edge type</p>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Edge type">
          {MAP_EDGE_KINDS.map((kind) => {
            const selected = kind.type === currentType;
            return (
              <button
                key={kind.type}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`edge-type-${kind.type}`}
                onClick={() => onTypeChange(edge.id, kind.type)}
                className={cn(
                  'flex items-start gap-2 rounded-md border p-2 text-left transition-colors',
                  selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                )}
              >
                <span
                  className="mt-1 h-2.5 w-6 shrink-0 rounded-full"
                  style={{
                    backgroundColor: kind.stroke,
                    ...(kind.dash ? { opacity: 0.6 } : {}),
                  }}
                  aria-hidden
                />
                <span>
                  <span className="text-sm font-medium">{kind.label}</span>
                  <span className="text-muted-foreground block text-[11px] leading-snug">
                    {kind.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-3">
        <ConditionBuilder
          key={edge.id}
          condition={edge.data?.condition}
          nodeKeys={nodeKeys}
          slotOptions={slotOptions}
          onChange={(condition) => onConditionChange(edge.id, condition)}
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-auto text-red-600 hover:text-red-700 dark:text-red-400"
        onClick={() => onDelete(edge.id)}
      >
        <Trash2 className="mr-1.5 h-4 w-4" /> Delete edge
      </Button>
    </aside>
  );
}

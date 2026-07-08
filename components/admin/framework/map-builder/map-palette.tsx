'use client';

/**
 * MapPalette (f-map-editor t-1) — the map editor's left sidebar: one draggable block
 * per node kind (module / stage / milestone / region). Each block is HTML5-draggable
 * — `onDragStart` sets `application/reactflow` to the node type, which the canvas'
 * `onDrop` reads back and validates against the kind registry before materialising a
 * node. Data-driven from `MAP_NODE_KINDS`, mirroring the workflow builder's palette.
 */

import { cn } from '@/lib/utils';
import { MAP_NODE_KINDS } from '@/components/admin/framework/map-builder/map-node-kinds';

function onDragStart(event: React.DragEvent<HTMLDivElement>, type: string) {
  event.dataTransfer.setData('application/reactflow', type);
  event.dataTransfer.effectAllowed = 'move';
}

export interface MapPaletteProps {
  /** Map of node type → count of nodes on the canvas using that kind. */
  typeCounts?: Readonly<Record<string, number>>;
}

export function MapPalette({ typeCounts = {} }: MapPaletteProps) {
  return (
    <aside
      data-testid="map-palette"
      className="bg-background flex h-full w-[240px] shrink-0 flex-col overflow-y-auto border-r p-3"
    >
      <h2 className="mb-3 text-sm font-semibold">Node kinds</h2>
      <div className="space-y-2">
        {MAP_NODE_KINDS.map((kind) => {
          const Icon = kind.icon;
          const count = typeCounts[kind.type] ?? 0;
          return (
            <div
              key={kind.type}
              data-testid={`map-palette-block-${kind.type}`}
              draggable
              onDragStart={(e) => onDragStart(e, kind.type)}
              title={kind.description}
              className={cn(
                'group cursor-grab rounded-md border p-2 transition-shadow hover:shadow-sm active:cursor-grabbing',
                kind.surface
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn('flex h-7 w-7 items-center justify-center rounded', kind.iconChip)}
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-sm font-medium">{kind.label}</span>
                {count > 0 && (
                  <span
                    data-testid={`map-palette-count-${kind.type}`}
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                      kind.iconChip
                    )}
                  >
                    {count}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] opacity-70">{kind.description}</p>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
        Drag a node kind onto the canvas to add it to the map.
      </p>
    </aside>
  );
}

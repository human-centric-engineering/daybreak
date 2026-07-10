'use client';

/**
 * The read-only facilitation-map canvas (f-ops-views t-5b) — the raw `@xyflow/react`
 * primitives (`ReactFlow` + `Background`/`Controls`/`MiniMap`) with drag / connect /
 * select disabled. It owns no state: the parent computes `nodes`/`edges` and this only
 * paints them.
 *
 * Two overlays plug in additively (f-engagement-analytics t-1, the host hook f-ops-views
 * promised): the per-journey explorer uses the default {@link journeyNodeTypes} (status
 * colouring) and no panel; the collective **map-heat** surface passes its own heat
 * `nodeTypes` + an `overlay` (legend / metric toggle) rendered as a top-left panel.
 * Both props are optional, so the explorer's call site is unchanged. All edges get a
 * direction arrow; advisory edges arrive pre-styled dashed.
 */

import type { ReactNode } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { useTheme } from '@/hooks/use-theme';
import { journeyNodeTypes } from '@/components/admin/framework/journey-explorer/journey-node';

interface JourneyCanvasProps {
  nodes: Node[];
  edges: Edge[];
  /** Node renderers; defaults to the journey status nodes. A heat overlay supplies its own. */
  nodeTypes?: NodeTypes;
  /** Optional canvas overlay (legend / metric toggle), rendered as a top-left panel. */
  overlay?: ReactNode;
}

export function JourneyCanvas({
  nodes,
  edges,
  nodeTypes = journeyNodeTypes,
  overlay,
}: JourneyCanvasProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div data-testid="journey-canvas" className="bg-muted/20 h-[600px] rounded-md border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={isDark ? 'dark' : 'light'}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        proOptions={{ hideAttribution: true }}
        aria-label="Facilitation map"
      >
        {overlay ? <Panel position="top-left">{overlay}</Panel> : null}
        <Background gap={16} color={isDark ? '#3f3f46' : undefined} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="dark:!bg-zinc-800"
          maskColor="rgba(0, 0, 0, 0.3)"
          nodeColor="rgba(148, 163, 184, 0.6)"
        />
      </ReactFlow>
    </div>
  );
}

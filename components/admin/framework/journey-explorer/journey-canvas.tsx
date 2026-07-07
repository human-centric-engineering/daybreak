'use client';

/**
 * The read-only journey map canvas (f-ops-views t-5b) — the raw `@xyflow/react`
 * primitives (`ReactFlow` + `Background`/`Controls`/`MiniMap`) with drag / connect /
 * select disabled. It owns no state: the parent explorer computes `nodes`/`edges`
 * (structure + status overlay) and this only paints them. The workflow builder's
 * node/edge types are step-specific, so this uses its own {@link journeyNodeTypes};
 * all edges get a direction arrow, advisory edges arrive pre-styled dashed.
 */

import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge } from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { useTheme } from '@/hooks/use-theme';
import { journeyNodeTypes } from '@/components/admin/framework/journey-explorer/journey-node';
import type { JourneyFlowNode } from '@/components/admin/framework/journey-explorer/journey-mapper';

interface JourneyCanvasProps {
  nodes: JourneyFlowNode[];
  edges: Edge[];
}

export function JourneyCanvas({ nodes, edges }: JourneyCanvasProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div data-testid="journey-canvas" className="bg-muted/20 h-[600px] rounded-md border">
      <ReactFlow<JourneyFlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={journeyNodeTypes}
        colorMode={isDark ? 'dark' : 'light'}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        proOptions={{ hideAttribution: true }}
        aria-label="Journey map"
      >
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

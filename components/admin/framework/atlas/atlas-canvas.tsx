'use client';

/**
 * AtlasCanvas (f-atlas t-2a) — the read-only `@xyflow/react` surface the composition graph draws on.
 * Drag / connect / multi-select disabled (the atlas navigates, never edits — X8); nodes stay
 * clickable so a click deep-links to the real editor. Owns no state: `<AtlasView>` computes
 * `nodes`/`edges` and handles the click. Modelled on the explorer's `journey-canvas.tsx` + the map
 * editor's `map-canvas.tsx`.
 */

import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge } from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { useTheme } from '@/hooks/use-theme';
import { atlasNodeTypes } from '@/components/admin/framework/atlas/atlas-node';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';

export interface AtlasCanvasProps {
  nodes: AtlasFlowNode[];
  edges: Edge[];
  /** Called with the clicked node so the parent can deep-link (nodes with a null `href` are inert). */
  onNodeClick: (node: AtlasFlowNode) => void;
}

export function AtlasCanvas({ nodes, edges, onNodeClick }: AtlasCanvasProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      data-testid="atlas-canvas"
      className="bg-muted/20 h-[70vh] min-h-[520px] rounded-md border"
    >
      <ReactFlow<AtlasFlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={atlasNodeTypes}
        onNodeClick={(_, node) => onNodeClick(node)}
        colorMode={isDark ? 'dark' : 'light'}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        proOptions={{ hideAttribution: true }}
        aria-label="Framework composition atlas"
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

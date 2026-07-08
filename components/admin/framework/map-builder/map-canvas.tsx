'use client';

/**
 * MapCanvas (f-map-editor t-1) — the React Flow surface the map editor draws on.
 * Purely presentational: it owns no state, wiring React Flow's callbacks back up to
 * `<MapBuilder>`. Modelled on the workflow builder's `WorkflowCanvas`.
 *
 * Drop handling: the palette sets `application/reactflow` to the node type on
 * dragstart. `onDrop` reads it back, validates it against the node-kind registry
 * (rejects unknown types), and computes the canvas-space position via
 * `screenToFlowPosition` before asking the parent to add the node.
 *
 * Edge drawing (t-2): nodes are connectable — dragging from a node's handle fires
 * `onConnect`, and the parent materialises a default typed edge. Keyboard delete is
 * disabled (`deleteKeyCode` null) so node/edge removal has a single path — the
 * inspector's Delete button — that also cleans up connected edges.
 */

import { useCallback } from 'react';

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { useTheme } from '@/hooks/use-theme';
import { addMapNode, isNodeType } from '@/components/admin/framework/map-builder/add-map-node';
import { mapNodeTypes } from '@/components/admin/framework/map-builder/map-node';
import { mapEdgeTypes } from '@/components/admin/framework/map-builder/map-edge';
import {
  EDGE_FLOW_TYPE,
  type MapFlowEdge,
  type MapFlowNode,
} from '@/components/admin/framework/map-builder/map-mappers';

export interface MapCanvasProps {
  nodes: MapFlowNode[];
  edges: MapFlowEdge[];
  onNodesChange: OnNodesChange<MapFlowNode>;
  onEdgesChange: OnEdgesChange<MapFlowEdge>;
  onConnect: OnConnect;
  onNodeClick: (nodeId: string | null) => void;
  onEdgeClick: (edgeId: string) => void;
  /** Called with a freshly-built node when the user drops a palette block. */
  onNodeAdd: (node: MapFlowNode) => void;
}

export function MapCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onNodeAdd,
}: MapCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!isNodeType(type)) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const node = addMapNode(
        type,
        position,
        nodes.map((n) => n.id)
      );
      if (node) onNodeAdd(node);
    },
    [nodes, onNodeAdd, screenToFlowPosition]
  );

  return (
    <div
      data-testid="map-canvas"
      className="bg-muted/20 relative flex-1 overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Empty map &mdash; drag a node kind from the palette to get started
          </p>
        </div>
      )}
      <ReactFlow<MapFlowNode, MapFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={mapNodeTypes}
        edgeTypes={mapEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onEdgeClick={(_, edge) => onEdgeClick(edge.id)}
        onPaneClick={() => onNodeClick(null)}
        colorMode={isDark ? 'dark' : 'light'}
        deleteKeyCode={null}
        defaultEdgeOptions={{ type: EDGE_FLOW_TYPE, markerEnd: { type: MarkerType.ArrowClosed } }}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        proOptions={{ hideAttribution: true }}
        aria-label="Map canvas"
      >
        <Background gap={16} color={isDark ? '#3f3f46' : undefined} />
        <Controls className="dark:!border-zinc-700 dark:!bg-zinc-800 dark:!shadow-lg [&>button]:dark:!border-zinc-700 [&>button]:dark:!bg-zinc-800 [&>button]:dark:!fill-zinc-300 [&>button:hover]:dark:!bg-zinc-700" />
        <MiniMap
          zoomable
          pannable
          className="dark:!bg-zinc-800"
          maskColor="rgba(0, 0, 0, 0.3)"
          nodeColor="rgba(148, 163, 184, 0.6)"
        />
      </ReactFlow>
    </div>
  );
}

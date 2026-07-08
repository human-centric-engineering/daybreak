'use client';

/**
 * AtlasGraph (f-atlas t-2b) — the semantic-zoom layer between `<AtlasView>` and the canvas. It lives
 * inside `<ReactFlowProvider>` so it can read the live zoom (`useViewport`), derives the detail level
 * (`forceExpand || zoom >= DETAIL_ZOOM`), applies it via the pure `applyDetail`, and hands the
 * hidden-flagged nodes/edges to the presentational canvas. Memoised on the detail boolean so a pan (or
 * a sub-threshold zoom nudge) doesn't recompute the graph.
 */

import { useMemo } from 'react';
import { useViewport, type Edge } from '@xyflow/react';

import { AtlasCanvas } from '@/components/admin/framework/atlas/atlas-canvas';
import { applyDetail, DETAIL_ZOOM } from '@/components/admin/framework/atlas/atlas-detail';
import type { AtlasFlowNode } from '@/components/admin/framework/atlas/atlas-mapper';

export interface AtlasGraphProps {
  nodes: AtlasFlowNode[];
  edges: Edge[];
  /** When true, satellites are shown regardless of zoom (the "Show all detail" override). */
  forceExpand: boolean;
  onNodeClick: (node: AtlasFlowNode) => void;
}

export function AtlasGraph({ nodes, edges, forceExpand, onNodeClick }: AtlasGraphProps) {
  const { zoom } = useViewport();
  const showDetail = forceExpand || zoom >= DETAIL_ZOOM;

  const display = useMemo(() => applyDetail(nodes, edges, showDetail), [nodes, edges, showDetail]);

  return <AtlasCanvas nodes={display.nodes} edges={display.edges} onNodeClick={onNodeClick} />;
}

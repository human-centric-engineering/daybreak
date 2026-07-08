'use client';

/**
 * AtlasGraph (f-atlas t-2b) — the semantic-zoom layer between `<AtlasView>` and the canvas. It lives
 * inside `<ReactFlowProvider>` so it can read the live zoom (`useViewport`), derives the detail level
 * (`forceExpand || zoom >= DETAIL_ZOOM`), applies it via the pure `applyDetail`, and hands the
 * hidden-flagged nodes/edges to the presentational canvas. Memoised on the detail boolean so a pan (or
 * a sub-threshold zoom nudge) doesn't recompute the graph.
 */

import { useMemo, useState } from 'react';
import { useOnViewportChange, type Edge, type Viewport } from '@xyflow/react';

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
  // Track zoom from viewport *changes* rather than `useViewport()`. On first paint React Flow's zoom
  // is its pre-`fitView` default of 1 (≥ DETAIL_ZOOM) — reading it there would flash a large atlas
  // fully-expanded before fitView settles and collapses it. Starting BELOW the threshold means the
  // pre-fit frame is the overview; the initial fitView fires `onChange` with the real zoom, which
  // then reveals detail only if it genuinely lands zoomed-in (a small atlas).
  const [zoom, setZoom] = useState(0);
  useOnViewportChange({ onChange: (vp: Viewport) => setZoom(vp.zoom) });
  const showDetail = forceExpand || zoom >= DETAIL_ZOOM;

  const display = useMemo(() => applyDetail(nodes, edges, showDetail), [nodes, edges, showDetail]);

  return <AtlasCanvas nodes={display.nodes} edges={display.edges} onNodeClick={onNodeClick} />;
}

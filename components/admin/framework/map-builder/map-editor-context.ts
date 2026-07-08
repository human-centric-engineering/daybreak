'use client';

/**
 * A tiny context threading the map editor's region-collapse callback down to the
 * custom `RegionNode` (f-map-editor t-2b). React Flow custom nodes only receive
 * `NodeProps`, so a node that needs to call back into `<MapBuilder>` (to toggle
 * collapse, which recomputes member visibility and clears the saved flag) reads it
 * from here rather than through serialisable node `data`.
 *
 * `useMapEditor` degrades to a no-op when rendered outside a provider, so the node
 * renders standalone (e.g. in isolation tests) without throwing.
 */

import { createContext, useContext } from 'react';

export interface MapEditorContextValue {
  onToggleCollapse: (regionId: string) => void;
}

const MapEditorContext = createContext<MapEditorContextValue | null>(null);

export const MapEditorProvider = MapEditorContext.Provider;

const NOOP: MapEditorContextValue = { onToggleCollapse: () => {} };

export function useMapEditor(): MapEditorContextValue {
  return useContext(MapEditorContext) ?? NOOP;
}

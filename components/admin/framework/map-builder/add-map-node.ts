/**
 * Factory for new map nodes dropped onto the canvas (f-map-editor t-1).
 *
 * Kept out of the React component so it unit-tests as plain TS (the canvas is
 * `'use client'` and pulls in React Flow; this doesn't). Two jobs the map factory
 * has that the workflow one doesn't:
 *
 *  - **Readable, unique keys.** A node's key IS its on-canvas label and its stable
 *    journey identity, so a fresh node gets a friendly `"<type>-<n>"` key (e.g.
 *    `module-1`), incremented past any existing key so drops never collide.
 *  - **A saveable module binding.** `mapDefinitionSchema` (the PATCH-body validator)
 *    requires a `module` node to carry a `moduleSlug`. A newly-dropped module node
 *    therefore defaults its `moduleSlug` to its own key, so an author can save a
 *    half-built draft (the point of save-draft) before binding the real module in
 *    the t-3 inspector. Non-module kinds carry no such default.
 */

import type { XYPosition } from '@xyflow/react';

import { NODE_TYPES, type NodeType } from '@/lib/framework/facilitation/map/schema';
import {
  REGION_FLOW_TYPE,
  type MapFlowNode,
} from '@/components/admin/framework/map-builder/map-mappers';
import { REGION_DEFAULT_SIZE } from '@/components/admin/framework/map-builder/region-membership';

/** Type guard: is `value` one of the four authored node kinds? */
export function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value);
}

/**
 * Generate a friendly, collision-free key for a new node of `type`, given the keys
 * already on the canvas: `"<type>-<n>"` with the smallest `n ≥ 1` not already used.
 */
export function nextNodeKey(type: NodeType, usedKeys: Iterable<string>): string {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  let n = 1;
  while (used.has(`${type}-${n}`)) n += 1;
  return `${type}-${n}`;
}

/**
 * Create a new map node of `type` at `position`. `usedKeys` seeds the unique-key
 * generator (pass the current canvas node keys). Returns `null` for an unknown type
 * so the canvas can drop an invalid drag payload silently.
 */
export function addMapNode(
  type: string,
  position: XYPosition,
  usedKeys: Iterable<string>
): MapFlowNode | null {
  if (!isNodeType(type)) return null;

  const key = nextNodeKey(type, usedKeys);

  // A region drops as a sized group container (its own React Flow node type); other
  // kinds drop as ordinary `map` nodes.
  if (type === 'region') {
    return {
      id: key,
      type: REGION_FLOW_TYPE,
      position,
      width: REGION_DEFAULT_SIZE.width,
      height: REGION_DEFAULT_SIZE.height,
      data: {
        label: key,
        nodeType: type,
        completionMode: 'once',
        collapsed: false,
        expandedHeight: REGION_DEFAULT_SIZE.height,
        hasError: false,
      },
    };
  }

  return {
    id: key,
    type: 'map',
    position,
    data: {
      label: key,
      nodeType: type,
      // A module node needs a slug to satisfy the save-draft validator; default it
      // to the key until the author binds a real module (t-3).
      ...(type === 'module' ? { moduleSlug: key } : {}),
      completionMode: 'once',
      hasError: false,
    },
  };
}

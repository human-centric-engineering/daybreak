/**
 * Map edge kinds (f-map-editor t-2) — the editor-facing decoration of the schema's
 * `EDGE_TYPES`. Proves the registry stays aligned with the schema vocabulary and that
 * structural vs advisory styling matches the journey-explorer convention.
 *
 * @see components/admin/framework/map-builder/map-edge-kinds.ts
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_EDGE_TYPE,
  MAP_EDGE_KINDS,
  mapEdgeKind,
} from '@/components/admin/framework/map-builder/map-edge-kinds';
import { EDGE_TYPES } from '@/lib/framework/facilitation/map/schema';

describe('MAP_EDGE_KINDS', () => {
  it('covers exactly the schema EDGE_TYPES, in order', () => {
    expect(MAP_EDGE_KINDS.map((k) => k.type)).toEqual([...EDGE_TYPES]);
  });

  it('renders structural edges solid and advisory edges dashed', () => {
    expect(mapEdgeKind('prerequisite').structural).toBe(true);
    expect(mapEdgeKind('prerequisite').dash).toBeUndefined();
    expect(mapEdgeKind('unlocks').structural).toBe(true);
    expect(mapEdgeKind('tangent').structural).toBe(false);
    expect(mapEdgeKind('tangent').dash).toBeTruthy();
    expect(mapEdgeKind('related_to').dash).toBeTruthy();
  });

  it('gives every kind a label, description and stroke', () => {
    for (const kind of MAP_EDGE_KINDS) {
      expect(kind.label).toBeTruthy();
      expect(kind.description).toBeTruthy();
      expect(kind.stroke).toMatch(/^#/);
    }
  });

  it('defaults a drawn edge to a structural prerequisite', () => {
    expect(DEFAULT_EDGE_TYPE).toBe('prerequisite');
    expect(mapEdgeKind(DEFAULT_EDGE_TYPE).structural).toBe(true);
  });
});

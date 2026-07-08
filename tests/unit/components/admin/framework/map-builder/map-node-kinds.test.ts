/**
 * Map node kinds (f-map-editor t-1) — the editor-facing decoration of the map
 * schema's `NODE_TYPES`. Proves the registry stays aligned with the schema vocabulary
 * and that every kind carries the presentation the palette + node need.
 *
 * @see components/admin/framework/map-builder/map-node-kinds.ts
 */

import { describe, it, expect } from 'vitest';

import {
  MAP_NODE_KINDS,
  mapNodeKind,
} from '@/components/admin/framework/map-builder/map-node-kinds';
import { NODE_TYPES } from '@/lib/framework/facilitation/map/schema';

describe('MAP_NODE_KINDS', () => {
  it('covers exactly the schema NODE_TYPES, in order', () => {
    expect(MAP_NODE_KINDS.map((k) => k.type)).toEqual([...NODE_TYPES]);
  });

  it('gives every kind a label, description, icon and styles', () => {
    for (const kind of MAP_NODE_KINDS) {
      expect(kind.label).toBeTruthy();
      expect(kind.description).toBeTruthy();
      expect(kind.icon).toBeTruthy();
      expect(kind.surface).toContain('border');
      expect(kind.iconChip).toBeTruthy();
    }
  });
});

describe('mapNodeKind', () => {
  it('looks up a kind by node type', () => {
    expect(mapNodeKind('module').label).toBe('Module');
    expect(mapNodeKind('region').type).toBe('region');
  });
});

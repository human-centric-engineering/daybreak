/**
 * Map node factory (f-map-editor t-1) — the pure `addMapNode` / `nextNodeKey` /
 * `isNodeType` helpers behind palette drops. No React, so plain TS.
 *
 * Proves: fresh keys are friendly and collision-free past existing keys; a module
 * node defaults its `moduleSlug` (so a half-built draft still validates on save);
 * non-module kinds carry no slug; and an unknown drag payload is rejected.
 *
 * @see components/admin/framework/map-builder/add-map-node.ts
 */

import { describe, it, expect } from 'vitest';

import {
  addMapNode,
  isNodeType,
  nextNodeKey,
} from '@/components/admin/framework/map-builder/add-map-node';
import { mapDefinitionSchema } from '@/lib/framework/facilitation/map/schema';
import { flowToMapDefinition } from '@/components/admin/framework/map-builder/map-mappers';

const POS = { x: 0, y: 0 };

describe('isNodeType', () => {
  it('accepts the four kinds and rejects anything else', () => {
    expect(isNodeType('module')).toBe(true);
    expect(isNodeType('region')).toBe(true);
    expect(isNodeType('agent_call')).toBe(false);
    expect(isNodeType('')).toBe(false);
  });
});

describe('nextNodeKey', () => {
  it('starts at 1 and skips used keys', () => {
    expect(nextNodeKey('stage', [])).toBe('stage-1');
    expect(nextNodeKey('stage', ['stage-1', 'stage-2'])).toBe('stage-3');
    // A gap is filled by the smallest free index.
    expect(nextNodeKey('stage', ['stage-2'])).toBe('stage-1');
  });
});

describe('addMapNode', () => {
  it('returns null for an unknown type', () => {
    expect(addMapNode('nope', POS, [])).toBeNull();
  });

  it('builds a node with a friendly unique key and the drop position', () => {
    const node = addMapNode('milestone', { x: 12, y: 34 }, ['milestone-1']);
    expect(node?.id).toBe('milestone-2');
    expect(node?.data.label).toBe('milestone-2');
    expect(node?.data.nodeType).toBe('milestone');
    expect(node?.position).toEqual({ x: 12, y: 34 });
  });

  it('defaults a module node moduleSlug so a fresh draft still validates on save', () => {
    const node = addMapNode('module', POS, []);
    expect(node?.data.moduleSlug).toBe('module-1');
    // Round-tripping just this node through the mapper yields a schema-valid draft.
    const def = flowToMapDefinition([node!], []);
    expect(mapDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it('gives non-module kinds no slug', () => {
    expect(addMapNode('stage', POS, [])?.data.moduleSlug).toBeUndefined();
    expect(addMapNode('region', POS, [])?.data.moduleSlug).toBeUndefined();
  });
});

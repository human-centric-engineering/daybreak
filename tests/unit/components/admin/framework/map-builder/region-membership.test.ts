/**
 * Region membership helpers (f-map-editor t-2b) — the pure graph maths behind
 * `@xyflow` parent/child regions. No React, so plain TS.
 *
 * Proves: absolute↔relative position resolution up the parent chain; parents-before-
 * children ordering; descendant detection; collapse→hidden propagation (incl. nesting);
 * reparenting that converts coordinate space so a node doesn't jump; and the collapse
 * toggle's height swap.
 *
 * @see components/admin/framework/map-builder/region-membership.ts
 */

import { describe, it, expect } from 'vitest';

import {
  REGION_COLLAPSED_HEIGHT,
  absoluteFlowPosition,
  descendantIds,
  isDescendant,
  readCollapsed,
  readSize,
  recomputeHidden,
  reparentNode,
  sortParentsFirst,
  stripReserved,
  toggleRegionCollapse,
} from '@/components/admin/framework/map-builder/region-membership';
import type { MapFlowNode } from '@/components/admin/framework/map-builder/map-mappers';

function fnode(
  id: string,
  over: Omit<Partial<MapFlowNode>, 'data'> & { data?: Partial<MapFlowNode['data']> } = {}
): MapFlowNode {
  const { data, ...rest } = over;
  return {
    id,
    type: 'map',
    position: { x: 0, y: 0 },
    ...rest,
    data: { label: id, nodeType: 'milestone', completionMode: 'once', ...data },
  };
}

const byId = (nodes: MapFlowNode[]) => new Map(nodes.map((n) => [n.id, n]));

describe('absoluteFlowPosition', () => {
  it('sums a child position with its parent chain', () => {
    const nodes = [
      fnode('r', { position: { x: 100, y: 50 } }),
      fnode('c', { position: { x: 10, y: 5 }, parentId: 'r' }),
    ];
    expect(absoluteFlowPosition(nodes[1], byId(nodes))).toEqual({ x: 110, y: 55 });
  });

  it('returns own position for a top-level node', () => {
    const n = fnode('a', { position: { x: 7, y: 8 } });
    expect(absoluteFlowPosition(n, byId([n]))).toEqual({ x: 7, y: 8 });
  });
});

describe('sortParentsFirst', () => {
  it('places a parent before its child regardless of input order', () => {
    const nodes = [fnode('c', { parentId: 'r' }), fnode('r', { type: 'region' })];
    const sorted = sortParentsFirst(nodes).map((n) => n.id);
    expect(sorted.indexOf('r')).toBeLessThan(sorted.indexOf('c'));
  });
});

describe('isDescendant / descendantIds', () => {
  const nodes = [
    fnode('r', { type: 'region' }),
    fnode('inner', { type: 'region', parentId: 'r' }),
    fnode('leaf', { parentId: 'inner' }),
    fnode('other'),
  ];
  it('detects nested descendants', () => {
    expect(isDescendant('leaf', 'r', byId(nodes))).toBe(true);
    expect(isDescendant('leaf', 'inner', byId(nodes))).toBe(true);
    expect(isDescendant('other', 'r', byId(nodes))).toBe(false);
  });
  it('collects every descendant of a region', () => {
    expect(descendantIds('r', nodes)).toEqual(new Set(['inner', 'leaf']));
  });
});

describe('recomputeHidden', () => {
  it('hides members of a collapsed region, including nested ones', () => {
    const nodes = [
      fnode('r', { type: 'region', data: { collapsed: true } }),
      fnode('inner', { type: 'region', parentId: 'r' }),
      fnode('leaf', { parentId: 'inner' }),
      fnode('free'),
    ];
    const out = recomputeHidden(nodes);
    const byKey = new Map(out.map((n) => [n.id, n]));
    expect(byKey.get('inner')?.hidden).toBe(true);
    expect(byKey.get('leaf')?.hidden).toBe(true);
    expect(byKey.get('free')?.hidden).toBeFalsy();
    expect(byKey.get('r')?.hidden).toBeFalsy();
  });
});

describe('reparentNode', () => {
  it('groups a node into a region, converting to a parent-relative position', () => {
    const nodes = [
      fnode('r', { type: 'region', position: { x: 100, y: 100 } }),
      fnode('n', { position: { x: 130, y: 140 } }),
    ];
    const out = reparentNode(nodes, 'n', 'r');
    const n = out.find((x) => x.id === 'n')!;
    expect(n.parentId).toBe('r');
    expect(n.extent).toBe('parent');
    expect(n.data.region).toBe('r');
    expect(n.position).toEqual({ x: 30, y: 40 }); // 130-100, 140-100
  });

  it('ungroups a node back to its absolute position', () => {
    const nodes = [
      fnode('r', { type: 'region', position: { x: 100, y: 100 } }),
      fnode('n', { position: { x: 30, y: 40 }, parentId: 'r', extent: 'parent' }),
    ];
    const out = reparentNode(nodes, 'n', null);
    const n = out.find((x) => x.id === 'n')!;
    expect(n.parentId).toBeUndefined();
    expect(n.data.region).toBeUndefined();
    expect(n.position).toEqual({ x: 130, y: 140 });
  });

  it('is a no-op when the parent is unchanged', () => {
    const nodes = [fnode('n')];
    expect(reparentNode(nodes, 'n', null)).toBe(nodes);
  });
});

describe('toggleRegionCollapse', () => {
  it('collapses to the header height and hides members, then restores on expand', () => {
    const start = [
      fnode('r', { type: 'region', height: 220, data: { collapsed: false } }),
      fnode('m', { parentId: 'r' }),
    ];
    const collapsed = toggleRegionCollapse(start, 'r');
    const rC = collapsed.find((n) => n.id === 'r')!;
    expect(rC.data.collapsed).toBe(true);
    expect(rC.height).toBe(REGION_COLLAPSED_HEIGHT);
    expect(rC.data.expandedHeight).toBe(220);
    expect(collapsed.find((n) => n.id === 'm')?.hidden).toBe(true);

    const expanded = toggleRegionCollapse(collapsed, 'r');
    const rE = expanded.find((n) => n.id === 'r')!;
    expect(rE.data.collapsed).toBe(false);
    expect(rE.height).toBe(220);
    expect(expanded.find((n) => n.id === 'm')?.hidden).toBe(false);
  });
});

describe('reserved meta readers', () => {
  it('reads size and collapsed flags', () => {
    expect(readSize({ _size: { width: 300, height: 200 } })).toEqual({ width: 300, height: 200 });
    expect(readSize({})).toBeNull();
    expect(readCollapsed({ _collapsed: true })).toBe(true);
    expect(readCollapsed({})).toBe(false);
  });
  it('strips all reserved keys', () => {
    expect(
      stripReserved({ _layout: { x: 0, y: 0 }, _size: { width: 1, height: 1 }, keep: 1 })
    ).toEqual({
      keep: 1,
    });
  });
});

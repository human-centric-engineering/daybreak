/**
 * Map edge factory (f-map-editor t-2) — the pure `makeMapEdge` behind drawing a
 * connection. No React, so plain TS.
 *
 * Proves: a valid connection becomes a default `prerequisite` map edge; a self-loop
 * or an endpoint-less connection is rejected; an explicit type is honoured.
 *
 * @see components/admin/framework/map-builder/add-map-edge.ts
 */

import { describe, it, expect } from 'vitest';
import type { Connection } from '@xyflow/react';

import { makeMapEdge } from '@/components/admin/framework/map-builder/add-map-edge';

describe('makeMapEdge', () => {
  it('builds a default prerequisite edge from a valid connection', () => {
    const edge = makeMapEdge({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null });
    expect(edge).not.toBeNull();
    expect(edge?.source).toBe('a');
    expect(edge?.target).toBe('b');
    expect(edge?.type).toBe('map');
    expect(edge?.data?.edgeType).toBe('prerequisite');
    expect(edge?.id).toContain('a__b');
  });

  it('honours an explicit edge type', () => {
    const edge = makeMapEdge(
      { source: 'a', target: 'b', sourceHandle: null, targetHandle: null },
      'unlocks'
    );
    expect(edge?.data?.edgeType).toBe('unlocks');
  });

  it('rejects a self-loop (a node cannot gate itself)', () => {
    expect(
      makeMapEdge({ source: 'a', target: 'a', sourceHandle: null, targetHandle: null })
    ).toBeNull();
  });

  it('rejects a connection missing an endpoint', () => {
    // React Flow types `source`/`target` as strings, but a defensive guard still
    // handles a null endpoint — cast to exercise it.
    expect(
      makeMapEdge({
        source: null,
        target: 'b',
        sourceHandle: null,
        targetHandle: null,
      } as unknown as Connection)
    ).toBeNull();
    expect(
      makeMapEdge({
        source: 'a',
        target: null,
        sourceHandle: null,
        targetHandle: null,
      } as unknown as Connection)
    ).toBeNull();
  });

  it('gives two edges between the same pair distinct ids', () => {
    const c = { source: 'a', target: 'b', sourceHandle: null, targetHandle: null };
    expect(makeMapEdge(c)?.id).not.toBe(makeMapEdge(c)?.id);
  });
});

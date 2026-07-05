/**
 * GraphStore topology (f-engine t-1) — the pure in-memory traversal.
 *
 * Pure and DB-free (the store imports only map/scope types), so this is a
 * `tests/unit` file with no `@/lib/db/client` mock. Table-driven over hand-authored
 * `MapDefinition` fixtures (in `tests/`, not shipped). Covers the F8 ops
 * (neighbours / reachableFrom / pathsBetween), the t-4 primitives (findCycles), and
 * first-class regions (F5).
 */

import { describe, it, expect } from 'vitest';
import { inMemoryGraphStore } from '@/lib/framework/facilitation/engine/graph-store';
import type {
  MapDefinition,
  MapNode,
  MapEdge,
  EdgeType,
} from '@/lib/framework/facilitation/map/schema';

function node(key: string, extra: Partial<MapNode> = {}): MapNode {
  return { key, type: 'milestone', completionMode: 'once', ...extra };
}
function edge(from: string, to: string, type: EdgeType = 'prerequisite'): MapEdge {
  return { from, to, type };
}
function def(nodes: MapNode[], edges: MapEdge[]): MapDefinition {
  return { nodes, edges };
}

describe('inMemoryGraphStore — accessors', () => {
  const store = inMemoryGraphStore(def([node('a'), node('b')], [edge('a', 'b', 'unlocks')]));

  it('exposes nodes and edges in authored order', () => {
    expect(store.nodes().map((n) => n.key)).toEqual(['a', 'b']);
    expect(store.edges()).toHaveLength(1);
  });

  it('resolves a node by key, undefined when absent', () => {
    expect(store.node('a')?.key).toBe('a');
    expect(store.node('ghost')).toBeUndefined();
  });
});

describe('neighbours', () => {
  const store = inMemoryGraphStore(
    def(
      [node('a'), node('b'), node('c')],
      [edge('a', 'b', 'prerequisite'), edge('a', 'c', 'unlocks')]
    )
  );

  it('returns outgoing edges by default', () => {
    expect(store.neighbours('a').map((e) => e.to)).toEqual(['b', 'c']);
  });

  it('filters by edge type', () => {
    expect(store.neighbours('a', { edgeTypes: ['prerequisite'] }).map((e) => e.to)).toEqual(['b']);
  });

  it('follows incoming edges when direction is in', () => {
    expect(store.neighbours('b', { direction: 'in' }).map((e) => e.from)).toEqual(['a']);
  });

  it('an empty edgeTypes array matches nothing (explicit no-edges, not all)', () => {
    expect(store.neighbours('a', { edgeTypes: [] })).toEqual([]);
  });

  it('returns [] for an absent node', () => {
    expect(store.neighbours('ghost')).toEqual([]);
  });
});

describe('reachableFrom', () => {
  it('reaches the transitive closure along a chain', () => {
    const store = inMemoryGraphStore(
      def([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')])
    );
    expect([...store.reachableFrom('a')].sort()).toEqual(['b', 'c']);
    expect([...store.reachableFrom('c')]).toEqual([]);
  });

  it('excludes the start unless a cycle leads back to it', () => {
    const store = inMemoryGraphStore(def([node('a'), node('b')], [edge('a', 'b'), edge('b', 'a')]));
    expect([...store.reachableFrom('a')].sort()).toEqual(['a', 'b']);
  });

  it('honours the edge-type filter', () => {
    const store = inMemoryGraphStore(
      def(
        [node('a'), node('b'), node('c')],
        [edge('a', 'b', 'prerequisite'), edge('b', 'c', 'related_to')]
      )
    );
    expect([...store.reachableFrom('a', { edgeTypes: ['prerequisite'] })]).toEqual(['b']);
  });

  it('follows incoming edges when direction is in', () => {
    const store = inMemoryGraphStore(
      def([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')])
    );
    expect([...store.reachableFrom('c', { direction: 'in' })].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty set for an absent node', () => {
    const store = inMemoryGraphStore(def([node('a')], []));
    expect([...store.reachableFrom('ghost')]).toEqual([]);
  });
});

describe('pathsBetween', () => {
  it('finds every simple path (branch then merge)', () => {
    const store = inMemoryGraphStore(
      def(
        [node('a'), node('b'), node('c'), node('d')],
        [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
      )
    );
    const paths = store.pathsBetween('a', 'd').map((p) => p.join('>'));
    expect(paths.sort()).toEqual(['a>b>d', 'a>c>d']);
  });

  it('returns the trivial path when from === to', () => {
    const store = inMemoryGraphStore(def([node('a')], []));
    expect(store.pathsBetween('a', 'a')).toEqual([['a']]);
  });

  it('returns [] when no path exists or an endpoint is absent', () => {
    const store = inMemoryGraphStore(def([node('a'), node('b')], []));
    expect(store.pathsBetween('a', 'b')).toEqual([]);
    expect(store.pathsBetween('a', 'ghost')).toEqual([]);
  });

  it('does not revisit nodes (no infinite loop through a cycle)', () => {
    const store = inMemoryGraphStore(
      def([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')])
    );
    expect(store.pathsBetween('a', 'c').map((p) => p.join('>'))).toEqual(['a>b>c']);
  });
});

describe('findCycles', () => {
  it('returns [] for an acyclic graph', () => {
    const store = inMemoryGraphStore(
      def([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')])
    );
    expect(store.findCycles()).toEqual([]);
  });

  it('detects a cycle and dedupes it across entry points', () => {
    const store = inMemoryGraphStore(
      def([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')])
    );
    const cycles = store.findCycles();
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(['a', 'b', 'c']);
  });

  it('confines the cycle to the requested edge types (t-4 prerequisite-cycle use)', () => {
    // A→B is a prerequisite; B→A is only related_to, so there is no cycle among
    // prerequisites — exactly the distinction t-4's invariant check relies on.
    const store = inMemoryGraphStore(
      def([node('a'), node('b')], [edge('a', 'b', 'prerequisite'), edge('b', 'a', 'related_to')])
    );
    expect(store.findCycles({ edgeTypes: ['prerequisite'] })).toEqual([]);
    expect(store.findCycles()).toHaveLength(1);
  });

  it('detects a self-loop', () => {
    const store = inMemoryGraphStore(def([node('a')], [edge('a', 'a', 'prerequisite')]));
    expect(store.findCycles({ edgeTypes: ['prerequisite'] })).toEqual([['a']]);
  });
});

describe('dangling edge endpoints (validate.ts’s concern) are skipped, never traversed', () => {
  // An edge to a non-existent node — a malformed map validate.ts rejects at publish.
  // Topology stays total: it skips the dangling endpoint rather than throwing.
  const store = inMemoryGraphStore(
    def([node('a'), node('b')], [edge('a', 'ghost'), edge('a', 'b')])
  );

  it('reachableFrom skips the missing endpoint', () => {
    expect([...store.reachableFrom('a')]).toEqual(['b']);
  });

  it('findCycles ignores edges into the void', () => {
    expect(store.findCycles()).toEqual([]);
  });

  it('pathsBetween never routes through a missing node', () => {
    expect(store.pathsBetween('a', 'b').map((p) => p.join('>'))).toEqual(['a>b']);
  });
});

describe('regions (F5)', () => {
  const store = inMemoryGraphStore(
    def(
      [
        node('r', { type: 'region' }),
        node('x', { region: 'r' }),
        node('y', { region: 'r' }),
        node('z'),
      ],
      []
    )
  );

  it('resolves the containing region of a node', () => {
    expect(store.regionOf('x')).toBe('r');
    expect(store.regionOf('z')).toBeUndefined();
    expect(store.regionOf('r')).toBeUndefined();
  });

  it('lists a region’s member nodes in authored order', () => {
    expect(store.nodesInRegion('r').map((n) => n.key)).toEqual(['x', 'y']);
    expect(store.nodesInRegion('empty')).toEqual([]);
  });
});

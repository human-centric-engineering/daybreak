/**
 * Publish-time graph invariants (f-engine t-4) — `validateGraphInvariants`. Pure and
 * DB-free (`tests/unit`, no mock). Covers prerequisite-cycle detection, reachability
 * (roots + progression edges), and the interplay with the other edge types.
 */

import { describe, it, expect } from 'vitest';
import { validateGraphInvariants } from '@/lib/framework/facilitation/engine/invariants';
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
const codes = (d: MapDefinition) =>
  validateGraphInvariants(d)
    .errors.map((e) => e.code)
    .sort();

describe('valid maps pass', () => {
  it('a linear prerequisite chain from a root', () => {
    const r = validateGraphInvariants(
      def([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')])
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('a single entry node with no edges', () => {
    expect(validateGraphInvariants(def([node('a')], [])).ok).toBe(true);
  });

  it('a node reached via unlocks or via a tangent side-path', () => {
    expect(
      validateGraphInvariants(def([node('a'), node('b')], [edge('a', 'b', 'unlocks')])).ok
    ).toBe(true);
    expect(
      validateGraphInvariants(def([node('a'), node('b')], [edge('a', 'b', 'tangent')])).ok
    ).toBe(true);
  });

  it('a related_to-only node is a root (advisory edges do not gate reachability)', () => {
    expect(
      validateGraphInvariants(def([node('a'), node('r')], [edge('a', 'r', 'related_to')])).ok
    ).toBe(true);
  });
});

describe('prerequisite cycles', () => {
  it('flags a cycle among prerequisite edges', () => {
    const d = def(
      [node('a'), node('b'), node('c')],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
    );
    const r = validateGraphInvariants(d);
    expect(r.ok).toBe(false);
    const cycle = r.errors.find((e) => e.code === 'PREREQUISITE_CYCLE');
    expect(cycle).toBeDefined();
    expect([...(cycle?.path ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not flag a cycle that runs through non-prerequisite edges', () => {
    // root a → b (prerequisite), with a b↔c *unlocks* cycle. The unlocks cycle is not
    // a prerequisite cycle, and everything is still reachable from root a, so no error.
    const d = def(
      [node('a'), node('b'), node('c')],
      [edge('a', 'b', 'prerequisite'), edge('b', 'c', 'unlocks'), edge('c', 'b', 'unlocks')]
    );
    expect(codes(d)).toEqual([]);
  });
});

describe('unreachable nodes', () => {
  it('flags a node with no path from any root', () => {
    // b→c and c→b are prerequisites of each other, disconnected from root a: neither
    // is a root, neither is reachable.
    const d = def(
      [node('a'), node('b'), node('c')],
      [edge('b', 'c', 'prerequisite'), edge('c', 'b', 'prerequisite')]
    );
    const r = validateGraphInvariants(d);
    const unreachable = r.errors.filter((e) => e.code === 'UNREACHABLE_NODE').map((e) => e.path[0]);
    expect(unreachable.sort()).toEqual(['b', 'c']);
  });

  it('an unlocks cycle disconnected from any root is unreachable', () => {
    const d = def([node('a'), node('b')], [edge('a', 'b', 'unlocks'), edge('b', 'a', 'unlocks')]);
    // Neither a nor b is a root (each has an incoming unlocks gate), so both unreachable.
    expect(codes(d)).toEqual(['UNREACHABLE_NODE', 'UNREACHABLE_NODE']);
  });
});

describe('accumulation', () => {
  it('reports every violation, not just the first', () => {
    const d = def(
      [node('a'), node('b'), node('x'), node('y')],
      [edge('a', 'b'), edge('b', 'a'), edge('x', 'y'), edge('y', 'x')] // two prerequisite cycles
    );
    const cycles = validateGraphInvariants(d).errors.filter((e) => e.code === 'PREREQUISITE_CYCLE');
    expect(cycles).toHaveLength(2);
  });
});

/**
 * map-validation (f-map-editor t-3) — the live-preflight combiner. Proves it merges
 * both pure validators into one node-keyed issue list, filters path entries down to
 * real node keys, and reports a clean map as no issues.
 *
 * @see components/admin/framework/map-builder/map-validation.ts
 */

import { describe, it, expect } from 'vitest';

import {
  collectMapIssues,
  issueNodeIds,
} from '@/components/admin/framework/map-builder/map-validation';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';

function def(over: Partial<MapDefinition> = {}): MapDefinition {
  return {
    nodes: [{ key: 'a', type: 'milestone', completionMode: 'once' }],
    edges: [],
    ...over,
  };
}

describe('collectMapIssues', () => {
  it('reports no issues for a clean, reachable map', () => {
    expect(collectMapIssues(def())).toEqual([]);
  });

  it('surfaces a format error (region-ref-not-region) keyed to the offending node', () => {
    const issues = collectMapIssues(
      def({
        nodes: [
          { key: 'a', type: 'milestone', completionMode: 'once' },
          { key: 'b', type: 'milestone', region: 'a', completionMode: 'once' },
        ],
      })
    );
    const issue = issues.find((i) => i.code === 'REGION_REF_NOT_REGION');
    expect(issue).toBeDefined();
    expect(issue?.nodeKeys).toContain('b');
  });

  it('surfaces a graph invariant (prerequisite cycle) from the engine validator', () => {
    const issues = collectMapIssues(
      def({
        nodes: [
          { key: 'a', type: 'milestone', completionMode: 'once' },
          { key: 'b', type: 'milestone', completionMode: 'once' },
        ],
        edges: [
          { from: 'a', to: 'b', type: 'prerequisite' },
          { from: 'b', to: 'a', type: 'prerequisite' },
        ],
      })
    );
    const cycle = issues.find((i) => i.code === 'PREREQUISITE_CYCLE');
    expect(cycle).toBeDefined();
    expect(cycle?.nodeKeys).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('keeps only path entries that resolve to a node (drops edge markers)', () => {
    // A dangling endpoint's only path entry is `edges[0]` — not a node key — so the
    // issue is listed with no node to ring.
    const issues = collectMapIssues(
      def({ edges: [{ from: 'a', to: 'ghost', type: 'prerequisite' }] })
    );
    const dangling = issues.find((i) => i.code === 'DANGLING_EDGE_ENDPOINT');
    expect(dangling).toBeDefined();
    expect(dangling?.nodeKeys).toEqual([]);
  });
});

describe('issueNodeIds', () => {
  it('unions the node keys across issues', () => {
    const ids = issueNodeIds([
      { code: 'UNREACHABLE_NODE', message: '', nodeKeys: ['a', 'b'] },
      { code: 'UNREACHABLE_NODE', message: '', nodeKeys: ['b', 'c'] },
    ]);
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('is empty when no issue carries a node key', () => {
    expect(issueNodeIds([{ code: 'DANGLING_EDGE_ENDPOINT', message: '', nodeKeys: [] }]).size).toBe(
      0
    );
  });
});

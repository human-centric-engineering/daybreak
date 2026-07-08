/**
 * runDryRun (f-map-editor t-5, F18) — the pure synthetic-input adapter. Proves it
 * reports a verdict for every node, turns `completions` into completed states (locking
 * them + unlocking dependents), and flows synthetic slot values and the clock through
 * the pure engine into the gating result + ranking. No DB, no mocks needed.
 *
 * @see lib/framework/facilitation/dry-run.ts
 */

import { describe, it, expect } from 'vitest';

import { runDryRun } from '@/lib/framework/facilitation/dry-run';
import type { MapDefinition } from '@/lib/framework/facilitation/map/schema';

const NOW = new Date('2026-07-08T00:00:00Z');

/** A milestone-only map with the given edges (keys default to a → b). */
function def(edges: MapDefinition['edges'], keys: string[] = ['a', 'b']): MapDefinition {
  return {
    nodes: keys.map((key) => ({ key, type: 'milestone', completionMode: 'once' })),
    edges,
  };
}

describe('runDryRun', () => {
  it('reports every node; a root is available and its prerequisite dependent is locked', () => {
    const r = runDryRun(def([{ from: 'a', to: 'b', type: 'prerequisite' }]), {
      completions: [],
      slots: [],
      now: NOW,
    });
    expect(r.nodes.map((n) => n.nodeKey).sort()).toEqual(['a', 'b']);
    expect(r.nodes.find((n) => n.nodeKey === 'a')?.available).toBe(true);
    const b = r.nodes.find((n) => n.nodeKey === 'b');
    expect(b?.available).toBe(false);
    expect(b?.lockReasons).toEqual([{ kind: 'prerequisite', from: 'a' }]);
    expect(r.validMoves).toEqual(['a']);
    expect(r.ranked.map((m) => m.nodeKey)).toEqual(['a']);
  });

  it('turns a completion into a completed state — locking it, unlocking its dependent', () => {
    const r = runDryRun(def([{ from: 'a', to: 'b', type: 'prerequisite' }]), {
      completions: ['a'],
      slots: [],
      now: NOW,
    });
    expect(r.nodes.find((n) => n.nodeKey === 'a')?.available).toBe(false);
    expect(r.nodes.find((n) => n.nodeKey === 'a')?.lockReasons).toEqual([{ kind: 'completed' }]);
    expect(r.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(true);
    expect(r.validMoves).toEqual(['b']);
  });

  it('flows a synthetic slot value into a slot-gated edge', () => {
    const edges: MapDefinition['edges'] = [
      {
        from: 'a',
        to: 'b',
        type: 'prerequisite',
        condition: { family: 'slot', slug: 'readiness', op: 'gte', value: 7 },
      },
    ];
    const locked = runDryRun(def(edges), { completions: ['a'], slots: [], now: NOW });
    expect(locked.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(false);

    const unlocked = runDryRun(def(edges), {
      completions: ['a'],
      slots: [{ slug: 'readiness', value: 8 }],
      now: NOW,
    });
    expect(unlocked.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(true);
  });

  it('flows the synthetic clock into a temporal gate', () => {
    const edges: MapDefinition['edges'] = [
      {
        from: 'a',
        to: 'b',
        type: 'prerequisite',
        condition: { family: 'temporal', kind: 'available_after', at: '2026-07-10T00:00:00Z' },
      },
    ];
    const before = runDryRun(def(edges), {
      completions: ['a'],
      slots: [],
      now: new Date('2026-07-05T00:00:00Z'),
    });
    expect(before.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(false);

    const after = runDryRun(def(edges), {
      completions: ['a'],
      slots: [],
      now: new Date('2026-07-11T00:00:00Z'),
    });
    expect(after.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(true);
  });

  it('respects a synthetic slot confidence below a gate minimum', () => {
    const edges: MapDefinition['edges'] = [
      {
        from: 'a',
        to: 'b',
        type: 'prerequisite',
        condition: { family: 'slot', slug: 'readiness', op: 'gte', value: 7, minConfidence: 8 },
      },
    ];
    const tooTentative = runDryRun(def(edges), {
      completions: ['a'],
      slots: [{ slug: 'readiness', value: 9, confidence: 3 }],
      now: NOW,
    });
    expect(tooTentative.nodes.find((n) => n.nodeKey === 'b')?.available).toBe(false);
  });
});

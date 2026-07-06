/**
 * Progress synopsis (f-guidance t-1) — pure, deterministic. Asserts the status tally,
 * milestone list, and the newest-first recent window (independent of input order).
 */

import { describe, it, expect } from 'vitest';
import {
  buildProgressSynopsis,
  type SynopsisEvent,
  type SynopsisNodeState,
} from '@/lib/framework/guidance/synopsis';

const state = (nodeKey: string, status: string): SynopsisNodeState => ({ nodeKey, status });
const event = (nodeKey: string | null, type: string, occurredAt: string): SynopsisEvent => ({
  nodeKey,
  type,
  occurredAt: new Date(occurredAt),
});

describe('buildProgressSynopsis', () => {
  it('tallies statuses and lists completed nodes as milestones', () => {
    const s = buildProgressSynopsis(
      [
        state('a', 'completed'),
        state('b', 'completed'),
        state('c', 'active'),
        state('d', 'visited'),
        state('e', 'available'),
        state('f', 'unvisited'),
      ],
      []
    );
    expect(s).toMatchObject({ totalTracked: 6, completed: 2, active: 1, visited: 1, available: 1 });
    expect(s.milestones).toEqual(['a', 'b']);
  });

  it('returns the most-recent transitions newest-first, regardless of input order', () => {
    const s = buildProgressSynopsis(
      [],
      [
        event('a', 'node_entered', '2026-07-01T00:00:00Z'),
        event('c', 'node_completed', '2026-07-05T00:00:00Z'),
        event('b', 'node_entered', '2026-07-03T00:00:00Z'),
      ],
      { recentLimit: 2 }
    );
    expect(s.recent.map((r) => r.nodeKey)).toEqual(['c', 'b']);
    expect(s.recent[0].occurredAt).toBe('2026-07-05T00:00:00.000Z'); // ISO-serialised
  });

  it('honours recentLimit 0 (no recent transitions)', () => {
    const s = buildProgressSynopsis([], [event('a', 'x', '2026-07-01T00:00:00Z')], {
      recentLimit: 0,
    });
    expect(s.recent).toEqual([]);
  });

  it('counts an unknown future status only in totalTracked', () => {
    const s = buildProgressSynopsis([state('a', 'some_future_status')], []);
    expect(s).toMatchObject({ totalTracked: 1, completed: 0, active: 0, visited: 0, available: 0 });
    expect(s.milestones).toEqual([]);
  });
});

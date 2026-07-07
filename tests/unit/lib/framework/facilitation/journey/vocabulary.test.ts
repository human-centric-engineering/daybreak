import { describe, it, expect } from 'vitest';

// Import the specific module, not the journey barrel: t-2 adds a DB-bound
// `queries.ts` to that barrel, and importing the barrel here would drag
// `@/lib/db/client` into this pure vocabulary test (planning-retro B12).
import {
  NODE_STATE_STATUS,
  JOURNEY_EVENT_TYPE,
  type NodeStateStatus,
} from '@/lib/framework/facilitation/journey/vocabulary';

/**
 * `UserNodeState.status` is a free-form `String` column (X1), but its allowed set is
 * a contract the deterministic engine (`f-engine`, feature 11) and guidance will
 * branch on. These tests lock that set to the spec's five statuses (§5.2) so a stray
 * add/remove/rename is a failing test, not silent drift — and keep the constant, the
 * Prisma model comment, and the spec in step.
 */
describe('NODE_STATE_STATUS', () => {
  it('is exactly the five §5.2 journey statuses, self-mapped', () => {
    expect(NODE_STATE_STATUS).toEqual({
      unvisited: 'unvisited',
      available: 'available',
      active: 'active',
      visited: 'visited',
      completed: 'completed',
    });
  });

  it('exposes each status under its own key (no aliasing / typos)', () => {
    for (const [key, value] of Object.entries(NODE_STATE_STATUS)) {
      expect(value).toBe(key);
    }
  });

  it('derives NodeStateStatus as the union of its values', () => {
    // Type-level contract, exercised at runtime: every value is assignable to the
    // exported union, and the union has no member the constant lacks.
    const all: NodeStateStatus[] = Object.values(NODE_STATE_STATUS);
    expect(all).toContain('active');
    expect(all).toHaveLength(5);
  });
});

describe('JOURNEY_EVENT_TYPE', () => {
  it('is the two engine traversal event types (the shared client-safe source)', () => {
    // apply-event.ts re-exports this as ENGINE_EVENT_TYPE; the journey-explorer replay
    // reducer imports it here — one source, so writer and reader can't drift.
    expect(JOURNEY_EVENT_TYPE).toEqual({
      nodeEntered: 'node_entered',
      nodeCompleted: 'node_completed',
    });
  });
});

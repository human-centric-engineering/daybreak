/**
 * Condition evaluation (f-engine t-2) — the pure `state` / `slot` / `temporal`
 * gate evaluator. Pure and DB-free; `now` and the state/slot views are inputs, so
 * every branch is exercised with a controlled clock. `tests/unit`, no DB mock.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  isCompleted,
  isReached,
  type NodeStateView,
  type SlotReadingView,
  type ConditionContext,
} from '@/lib/framework/facilitation/engine/conditions';
import type { MapCondition } from '@/lib/framework/facilitation/map/schema';

function state(status: string, extra: Partial<NodeStateView> = {}): NodeStateView {
  return { status, firstEnteredAt: null, lastActiveAt: null, ...extra };
}

function ctx(over: Partial<ConditionContext> = {}): ConditionContext {
  return {
    nodeState: () => undefined,
    slot: () => undefined,
    now: new Date('2026-07-05T12:00:00Z'),
    target: undefined,
    ...over,
  };
}

describe('isCompleted / isReached', () => {
  it('completed only for status completed', () => {
    expect(isCompleted(state('completed'))).toBe(true);
    expect(isCompleted(state('active'))).toBe(false);
    expect(isCompleted(undefined)).toBe(false);
  });
  it('reached for any entered status', () => {
    expect(isReached(state('visited'))).toBe(true);
    expect(isReached(state('active'))).toBe(true);
    expect(isReached(state('completed'))).toBe(true);
    expect(isReached(state('unvisited'))).toBe(false);
    expect(isReached(undefined)).toBe(false);
  });
});

describe('state predicate', () => {
  const reachedMilestone: MapCondition = { family: 'state', milestone: 'm', reached: true };
  const notReached: MapCondition = { family: 'state', milestone: 'm', reached: false };

  it('satisfied when the milestone is completed and reached=true', () => {
    expect(evaluateCondition(reachedMilestone, ctx({ nodeState: () => state('completed') }))).toBe(
      true
    );
  });
  it('unsatisfied when the milestone is not completed and reached=true', () => {
    expect(evaluateCondition(reachedMilestone, ctx({ nodeState: () => state('active') }))).toBe(
      false
    );
    expect(evaluateCondition(reachedMilestone, ctx({ nodeState: () => undefined }))).toBe(false);
  });
  it('inverts for reached=false', () => {
    expect(evaluateCondition(notReached, ctx({ nodeState: () => state('active') }))).toBe(true);
    expect(evaluateCondition(notReached, ctx({ nodeState: () => state('completed') }))).toBe(false);
  });
});

describe('slot predicate', () => {
  const slot = (over: Partial<SlotReadingView>): SlotReadingView => ({
    slotSlug: 'readiness',
    valueJson: 8,
    confidence: 9,
    ...over,
  });
  const gte7: MapCondition = { family: 'slot', slug: 'readiness', op: 'gte', value: 7 };

  it('compares the typed value with the op', () => {
    expect(evaluateCondition(gte7, ctx({ slot: () => slot({ valueJson: 8 }) }))).toBe(true);
    expect(evaluateCondition(gte7, ctx({ slot: () => slot({ valueJson: 6 }) }))).toBe(false);
  });
  it('is unsatisfied when the slot is missing', () => {
    expect(evaluateCondition(gte7, ctx({ slot: () => undefined }))).toBe(false);
  });
  it('enforces minConfidence', () => {
    const cond: MapCondition = {
      family: 'slot',
      slug: 'readiness',
      op: 'gte',
      value: 7,
      minConfidence: 8,
    };
    expect(evaluateCondition(cond, ctx({ slot: () => slot({ confidence: 9 }) }))).toBe(true);
    expect(evaluateCondition(cond, ctx({ slot: () => slot({ confidence: 5 }) }))).toBe(false);
  });
  it('eq works for strings; gte/lte need matching orderable types', () => {
    const eqCond: MapCondition = { family: 'slot', slug: 'readiness', op: 'eq', value: 'ready' };
    expect(evaluateCondition(eqCond, ctx({ slot: () => slot({ valueJson: 'ready' }) }))).toBe(true);
    const gteStr: MapCondition = { family: 'slot', slug: 'readiness', op: 'gte', value: 7 };
    // string value vs numeric gate ⇒ incomparable ⇒ false, never a coerced surprise.
    expect(evaluateCondition(gteStr, ctx({ slot: () => slot({ valueJson: '8' }) }))).toBe(false);
  });
  it('non-scalar valueJson is never a gate value', () => {
    expect(evaluateCondition(gte7, ctx({ slot: () => slot({ valueJson: { n: 8 } }) }))).toBe(false);
    expect(evaluateCondition(gte7, ctx({ slot: () => slot({ valueJson: null }) }))).toBe(false);
  });
});

describe('temporal predicate', () => {
  const now = new Date('2026-07-05T12:00:00Z');
  const base = ctx({ now });

  it('available_after gates on now >= at', () => {
    const past: MapCondition = {
      family: 'temporal',
      kind: 'available_after',
      at: '2026-07-01T00:00:00Z',
    };
    const future: MapCondition = {
      family: 'temporal',
      kind: 'available_after',
      at: '2026-07-10T00:00:00Z',
    };
    expect(evaluateCondition(past, base)).toBe(true);
    expect(evaluateCondition(future, base)).toBe(false);
  });
  it('available_until gates on now <= at', () => {
    const future: MapCondition = {
      family: 'temporal',
      kind: 'available_until',
      at: '2026-07-10T00:00:00Z',
    };
    const past: MapCondition = {
      family: 'temporal',
      kind: 'available_until',
      at: '2026-07-01T00:00:00Z',
    };
    expect(evaluateCondition(future, base)).toBe(true);
    expect(evaluateCondition(past, base)).toBe(false);
  });
  it('honours zoned-ISO offsets', () => {
    // 2026-07-05T14:30:00+03:00 == 11:30Z, which is before 12:00Z now.
    const cond: MapCondition = {
      family: 'temporal',
      kind: 'available_after',
      at: '2026-07-05T14:30:00+03:00',
    };
    expect(evaluateCondition(cond, base)).toBe(true);
  });
  it('recommended_by is advisory — never gates', () => {
    const cond: MapCondition = {
      family: 'temporal',
      kind: 'recommended_by',
      at: '2020-01-01T00:00:00Z',
    };
    expect(evaluateCondition(cond, base)).toBe(true);
  });

  describe('cooldown_since_last_visit (relative to the target node)', () => {
    const cooldown: MapCondition = {
      family: 'temporal',
      kind: 'cooldown_since_last_visit',
      durationHours: 24,
    };
    it('passes when the target was never visited', () => {
      expect(evaluateCondition(cooldown, ctx({ now, target: state('unvisited') }))).toBe(true);
    });
    it('blocks within the cooldown window', () => {
      const target = state('completed', { lastActiveAt: new Date('2026-07-05T00:00:00Z') }); // 12h ago
      expect(evaluateCondition(cooldown, ctx({ now, target }))).toBe(false);
    });
    it('passes once the window has elapsed', () => {
      const target = state('completed', { lastActiveAt: new Date('2026-07-03T00:00:00Z') }); // 60h ago
      expect(evaluateCondition(cooldown, ctx({ now, target }))).toBe(true);
    });
  });
});

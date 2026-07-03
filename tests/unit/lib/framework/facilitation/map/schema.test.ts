/**
 * Unit tests — facilitation map format schema (f-map t-1).
 *
 * Proves `mapDefinitionSchema` (and its parts) accept every well-formed shape
 * and reject each malformed one — especially F3 (four edge types), F4 (three
 * condition families, unknown rejected + temporal kind↔field rules), and the
 * per-node `type:'module'` ⇒ `moduleSlug` rule. Pure — no DB, no mocks.
 *
 * @see lib/framework/facilitation/map/schema.ts
 */

import { describe, it, expect } from 'vitest';
import {
  conditionSchema,
  edgeSchema,
  mapDefinitionSchema,
  nodeSchema,
} from '@/lib/framework/facilitation/map';

describe('nodeSchema', () => {
  it('accepts each node type and defaults completionMode to "once"', () => {
    for (const type of ['stage', 'milestone', 'region'] as const) {
      const parsed = nodeSchema.parse({ key: `n-${type}`, type });
      expect(parsed.type).toBe(type);
      expect(parsed.completionMode).toBe('once');
    }
  });

  it('accepts a module node with a moduleSlug and keeps an explicit completionMode', () => {
    const parsed = nodeSchema.parse({
      key: 'lesson-1',
      type: 'module',
      moduleSlug: 'reading',
      completionMode: 'repeatable',
    });
    expect(parsed.moduleSlug).toBe('reading');
    expect(parsed.completionMode).toBe('repeatable');
  });

  it('rejects a module node without a moduleSlug (per-node shape rule)', () => {
    const result = nodeSchema.safeParse({ key: 'lesson-1', type: 'module' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['moduleSlug']);
  });

  it('rejects an unknown node type and an empty key', () => {
    expect(nodeSchema.safeParse({ key: 'x', type: 'quest' }).success).toBe(false);
    expect(nodeSchema.safeParse({ key: '', type: 'stage' }).success).toBe(false);
  });

  it('carries optional region, stage, onFirstArrival and meta through', () => {
    const parsed = nodeSchema.parse({
      key: 'welcome',
      type: 'milestone',
      stage: 'intro',
      region: 'onboarding',
      onFirstArrival: { workflowSlug: 'greet', agentSlug: 'guide' },
      meta: { color: 'blue' },
    });
    expect(parsed.region).toBe('onboarding');
    expect(parsed.onFirstArrival?.workflowSlug).toBe('greet');
    expect(parsed.meta).toEqual({ color: 'blue' });
  });
});

describe('edgeSchema', () => {
  it('accepts all four edge types (F3) and rejects any other', () => {
    for (const type of ['prerequisite', 'unlocks', 'tangent', 'related_to'] as const) {
      expect(edgeSchema.safeParse({ from: 'a', to: 'b', type }).success).toBe(true);
    }
    expect(edgeSchema.safeParse({ from: 'a', to: 'b', type: 'blocks' }).success).toBe(false);
  });

  it('accepts an edge carrying a valid condition', () => {
    const parsed = edgeSchema.parse({
      from: 'a',
      to: 'b',
      type: 'prerequisite',
      condition: { family: 'state', milestone: 'a', reached: true },
    });
    expect(parsed.condition?.family).toBe('state');
  });
});

describe('conditionSchema (F4)', () => {
  it('rejects an unknown family — the forward-compat guard', () => {
    expect(conditionSchema.safeParse({ family: 'mood', value: 'happy' }).success).toBe(false);
  });

  it('accepts a state predicate and defaults reached to true', () => {
    const parsed = conditionSchema.parse({ family: 'state', milestone: 'm1' });
    expect(parsed).toMatchObject({ family: 'state', milestone: 'm1', reached: true });
  });

  it('accepts a slot predicate and range-checks minConfidence', () => {
    expect(
      conditionSchema.safeParse({
        family: 'slot',
        slug: 'mastery',
        op: 'gte',
        value: 7,
        minConfidence: 8,
      }).success
    ).toBe(true);
    expect(
      conditionSchema.safeParse({
        family: 'slot',
        slug: 'mastery',
        op: 'gte',
        value: 7,
        minConfidence: 11,
      }).success
    ).toBe(false);
  });

  describe('temporal predicate — kind determines the required field', () => {
    it.each(['available_after', 'available_until', 'recommended_by'] as const)(
      'requires an ISO-8601 "at" for %s',
      (kind) => {
        expect(conditionSchema.safeParse({ family: 'temporal', kind }).success).toBe(false);
        expect(
          conditionSchema.safeParse({ family: 'temporal', kind, at: '2026-07-03T00:00:00Z' })
            .success
        ).toBe(true);
        // A zoned ISO-8601 offset (not only UTC "Z") is accepted.
        expect(
          conditionSchema.safeParse({ family: 'temporal', kind, at: '2026-07-03T09:00:00+02:00' })
            .success
        ).toBe(true);
        // A non-ISO string is rejected.
        expect(
          conditionSchema.safeParse({ family: 'temporal', kind, at: 'next week' }).success
        ).toBe(false);
      }
    );

    it('requires durationHours for cooldown_since_last_visit, not an "at"', () => {
      expect(
        conditionSchema.safeParse({ family: 'temporal', kind: 'cooldown_since_last_visit' }).success
      ).toBe(false);
      expect(
        conditionSchema.safeParse({
          family: 'temporal',
          kind: 'cooldown_since_last_visit',
          durationHours: 24,
        }).success
      ).toBe(true);
      // durationHours must be positive.
      expect(
        conditionSchema.safeParse({
          family: 'temporal',
          kind: 'cooldown_since_last_visit',
          durationHours: 0,
        }).success
      ).toBe(false);
    });

    it('rejects a date kind that supplies only durationHours (wrong field)', () => {
      expect(
        conditionSchema.safeParse({
          family: 'temporal',
          kind: 'available_after',
          durationHours: 24,
        }).success
      ).toBe(false);
    });
  });
});

describe('mapDefinitionSchema', () => {
  it('accepts an empty map (a fresh draft)', () => {
    expect(mapDefinitionSchema.parse({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });

  it('accepts a rich map spanning every node type, edge type and condition family', () => {
    const result = mapDefinitionSchema.safeParse({
      nodes: [
        { key: 'onboarding', type: 'region' },
        { key: 'intro', type: 'stage', region: 'onboarding' },
        { key: 'welcome', type: 'milestone', region: 'onboarding' },
        { key: 'reading', type: 'module', moduleSlug: 'reading' },
      ],
      edges: [
        { from: 'welcome', to: 'reading', type: 'prerequisite' },
        {
          from: 'reading',
          to: 'intro',
          type: 'unlocks',
          condition: { family: 'slot', slug: 'mastery', op: 'gte', value: 7 },
        },
        {
          from: 'intro',
          to: 'reading',
          type: 'tangent',
          condition: {
            family: 'temporal',
            kind: 'cooldown_since_last_visit',
            durationHours: 48,
          },
        },
        { from: 'welcome', to: 'intro', type: 'related_to' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a map whose nodes array is missing', () => {
    expect(mapDefinitionSchema.safeParse({ edges: [] }).success).toBe(false);
  });
});

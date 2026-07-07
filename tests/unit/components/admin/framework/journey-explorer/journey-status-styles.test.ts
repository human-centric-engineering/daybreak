/**
 * Journey status styles (f-ops-views t-5b) — the single source of truth the canvas
 * node and the legend both derive from. This test is the drift guard: it fails if a
 * journey status ever lacks a style or drops out of the legend order.
 *
 * @see components/admin/framework/journey-explorer/journey-status-styles.ts
 */

import { describe, it, expect } from 'vitest';

import {
  JOURNEY_STATUS_STYLES,
  JOURNEY_STATUS_ORDER,
  UNVISITED_STATUS_STYLE,
} from '@/components/admin/framework/journey-explorer/journey-status-styles';
import { NODE_STATE_STATUS } from '@/lib/framework/facilitation/journey/vocabulary';

describe('journey status styles', () => {
  it('defines a complete style (label + dot + node) for every journey status', () => {
    for (const status of Object.values(NODE_STATE_STATUS)) {
      const style = JOURNEY_STATUS_STYLES[status];
      expect(style, `missing style for "${status}"`).toBeDefined();
      expect(style.label).toBeTruthy();
      expect(style.dot).toBeTruthy();
      expect(style.node).toBeTruthy();
    }
  });

  it('orders every status in the legend exactly once', () => {
    expect([...JOURNEY_STATUS_ORDER].sort()).toEqual([...Object.values(NODE_STATE_STATUS)].sort());
  });

  it('exposes the unvisited style as the neutral fallback', () => {
    expect(UNVISITED_STATUS_STYLE).toBe(JOURNEY_STATUS_STYLES[NODE_STATE_STATUS.unvisited]);
  });
});

/**
 * Map-heat styles (f-engagement-analytics t-1b) — the pure intensity scale + per-metric
 * ramps. No React, so plain TS. Proves: bucket 0 for zero/empty, proportional 1–4 with
 * the map max landing on 4, the clamp, metric selection, and legend derivation.
 *
 * @see components/admin/framework/map-heat/map-heat-styles.ts
 */

import { describe, it, expect } from 'vitest';

import {
  intensityBucket,
  metricValue,
  bucketNodeClass,
  legendEntries,
} from '@/components/admin/framework/map-heat/map-heat-styles';

describe('intensityBucket', () => {
  it('is 0 (neutral) for a zero value or an all-zero map', () => {
    expect(intensityBucket(0, 10)).toBe(0);
    expect(intensityBucket(5, 0)).toBe(0);
    expect(intensityBucket(0, 0)).toBe(0);
  });

  it('puts the map max on bucket 4 and scales the rest proportionally', () => {
    expect(intensityBucket(10, 10)).toBe(4); // the busiest node
    expect(intensityBucket(8, 10)).toBe(4); // ceil(3.2)=4
    expect(intensityBucket(6, 10)).toBe(3); // ceil(2.4)=3
    expect(intensityBucket(4, 10)).toBe(2); // ceil(1.6)=2
    expect(intensityBucket(1, 10)).toBe(1); // ceil(0.4)=1, floored up to 1
  });

  it('clamps into 1..4 and never exceeds 4', () => {
    expect(intensityBucket(1, 100)).toBe(1); // tiny fraction floors to 1
    expect(intensityBucket(100, 10)).toBe(4); // over-max still caps at 4
  });
});

describe('metricValue', () => {
  const node = { distinctUsers: 7, dropOff: 3 };
  it('reads distinctUsers for traffic and dropOff for drop-off', () => {
    expect(metricValue(node, 'traffic')).toBe(7);
    expect(metricValue(node, 'dropoff')).toBe(3);
  });
});

describe('ramps and legend', () => {
  it('uses distinct (sky vs rose) ramps per metric so colour reads the right direction', () => {
    expect(bucketNodeClass(4, 'traffic')).toContain('sky');
    expect(bucketNodeClass(4, 'dropoff')).toContain('rose');
  });

  it('bucket 0 is the neutral class for either metric', () => {
    expect(bucketNodeClass(0, 'traffic')).toBe(bucketNodeClass(0, 'dropoff'));
  });

  it('legend lists the four non-zero buckets low→high', () => {
    const entries = legendEntries('traffic');
    expect(entries.map((e) => e.bucket)).toEqual([1, 2, 3, 4]);
    expect(entries[3].className).toContain('sky');
  });
});

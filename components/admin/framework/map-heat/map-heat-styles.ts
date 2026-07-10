/**
 * The heat intensity scale + per-metric colour ramps (f-engagement-analytics t-1b).
 *
 * The collective map-heat overlay colours each node by ONE metric relative to the
 * busiest/worst node on the map — a sequential ramp, five buckets (0 = no data, 1–4 =
 * rising intensity). Two metrics, two ramps so the colour reads the right direction:
 * **traffic** (distinct users) climbs a cool→warm sky ramp; **drop-off** (entered but
 * never completed) climbs a rose ramp (more = worse). The node renderer and the legend
 * both derive from here, so they can't drift (the journey-status-styles precedent).
 */

/** Which figure drives the colour; the node always shows every raw figure. */
export type HeatMetric = 'traffic' | 'dropoff';

/** Bucket 0 (no data / zero) → 4 (the map's max for the active metric). */
export type IntensityBucket = 0 | 1 | 2 | 3 | 4;

/** Node border+fill classes (light + dark) per bucket, index 0..4. Bucket 0 is neutral. */
type Ramp = readonly [string, string, string, string, string];

const NEUTRAL = 'border-border bg-background';

const TRAFFIC_RAMP: Ramp = [
  NEUTRAL,
  'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
  'border-sky-300 bg-sky-100 dark:border-sky-700 dark:bg-sky-900/50',
  'border-sky-400 bg-sky-200 dark:border-sky-600 dark:bg-sky-800/60',
  'border-sky-500 bg-sky-300 dark:border-sky-500 dark:bg-sky-700/70',
];

const DROPOFF_RAMP: Ramp = [
  NEUTRAL,
  'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40',
  'border-rose-300 bg-rose-100 dark:border-rose-700 dark:bg-rose-900/50',
  'border-rose-400 bg-rose-200 dark:border-rose-600 dark:bg-rose-800/60',
  'border-rose-500 bg-rose-300 dark:border-rose-500 dark:bg-rose-700/70',
];

const RAMPS: Record<HeatMetric, Ramp> = { traffic: TRAFFIC_RAMP, dropoff: DROPOFF_RAMP };

/** The value each metric colours by, for one node. */
export function metricValue(
  node: { distinctUsers: number; dropOff: number },
  metric: HeatMetric
): number {
  return metric === 'traffic' ? node.distinctUsers : node.dropOff;
}

/**
 * Bucket a value against the map's max for the active metric. `value <= 0` or `max <= 0`
 * ⇒ bucket 0 (neutral); otherwise a proportional 1–4 (the max node always reads 4). Guards
 * the empty/all-zero map so it never divides by zero.
 */
export function intensityBucket(value: number, max: number): IntensityBucket {
  if (value <= 0 || max <= 0) return 0;
  const scaled = Math.ceil((value / max) * 4);
  return Math.min(4, Math.max(1, scaled)) as IntensityBucket;
}

/** The node border+fill classes for a bucket under a metric. */
export function bucketNodeClass(bucket: IntensityBucket, metric: HeatMetric): string {
  return RAMPS[metric][bucket];
}

/** Human labels for the metric toggle. */
export const METRIC_LABELS: Record<HeatMetric, string> = {
  traffic: 'Traffic (users)',
  dropoff: 'Drop-off',
};

/** Legend entries (low→high) for the active metric — a swatch per non-zero bucket. */
export function legendEntries(
  metric: HeatMetric
): { bucket: IntensityBucket; className: string }[] {
  return ([1, 2, 3, 4] as const).map((bucket) => ({
    bucket,
    className: bucketNodeClass(bucket, metric),
  }));
}

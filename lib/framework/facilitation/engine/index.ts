/**
 * Facilitation engine — the deterministic spine (spec §5.3, F11): pure topology +
 * availability over the map, and the sole validated writer of journey state.
 *
 * f-engine t-1 ships the `GraphStore` topology layer (`graph-store.ts` +
 * `published-graph.ts`); t-2 adds the pure availability computation
 * (`computeAvailability` + the condition evaluator) and the timezone-resolving
 * `resolveJourneyNow` seam; t-3 adds `applyEvent`, the sole validated writer of
 * journey state (F11). Publish-invariant validation (t-4) lands next — see
 * `.context/framework/planning/f-engine.md`.
 *
 * `graph-store.ts`, `conditions.ts`, and `availability.ts` are pure;
 * `published-graph.ts`, `now.ts`, and `apply-event.ts` touch `@/lib/db/*`. Per B12,
 * pure/unit tests import the specific pure module, not this barrel.
 */
export * from '@/lib/framework/facilitation/engine/graph-store';
export * from '@/lib/framework/facilitation/engine/published-graph';
export * from '@/lib/framework/facilitation/engine/conditions';
export * from '@/lib/framework/facilitation/engine/availability';
export * from '@/lib/framework/facilitation/engine/now';
export * from '@/lib/framework/facilitation/engine/apply-event';
export * from '@/lib/framework/facilitation/engine/invariants';
export * from '@/lib/framework/facilitation/engine/live-key-impact';

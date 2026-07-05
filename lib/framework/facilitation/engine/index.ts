/**
 * Facilitation engine — the deterministic spine (spec §5.3, F11): pure topology +
 * availability over the map, and the sole validated writer of journey state.
 *
 * f-engine t-1 ships the `GraphStore` topology layer (`graph-store.ts` +
 * `published-graph.ts`); t-2 adds the pure availability computation
 * (`computeAvailability` + the condition evaluator) and the timezone-resolving
 * `resolveJourneyNow` seam. The `applyEvent` writer (t-3) and publish-invariant
 * validation (t-4) land next — see `.context/framework/planning/f-engine.md`.
 *
 * `graph-store.ts`, `conditions.ts`, and `availability.ts` are pure;
 * `published-graph.ts` and `now.ts` import `@/lib/db/client`. Per B12, pure/unit
 * tests import the specific pure module, not this barrel.
 */
export * from '@/lib/framework/facilitation/engine/graph-store';
export * from '@/lib/framework/facilitation/engine/published-graph';
export * from '@/lib/framework/facilitation/engine/conditions';
export * from '@/lib/framework/facilitation/engine/availability';
export * from '@/lib/framework/facilitation/engine/now';

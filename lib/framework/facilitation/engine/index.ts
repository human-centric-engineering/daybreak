/**
 * Facilitation engine — the deterministic spine (spec §5.3, F11): pure topology +
 * availability over the map, and the sole validated writer of journey state.
 *
 * f-engine t-1 ships the `GraphStore` topology layer: the pure in-memory store +
 * traversal (`graph-store.ts`) and the DB-bound `getPublishedGraph` loader
 * (`published-graph.ts`). Availability computation (t-2), the `applyEvent` writer
 * (t-3), and publish-invariant validation (t-4) land next — see
 * `.context/framework/planning/f-engine.md`.
 *
 * `graph-store.ts` is pure; `published-graph.ts` imports `@/lib/db/client` via the
 * map version-service. Per B12, pure/unit tests import `graph-store` directly, not
 * this barrel.
 */
export * from '@/lib/framework/facilitation/engine/graph-store';
export * from '@/lib/framework/facilitation/engine/published-graph';

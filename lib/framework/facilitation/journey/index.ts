/**
 * Journey domain — per-user runtime traversal state over an authored map: the
 * `UserJourney` / `UserNodeState` / `JourneyEvent` models (f-journey-state t-1) and,
 * from t-2, the `canRead`-guarded read queries. The deterministic engine that
 * *writes* this state is `f-engine` (feature 11). See spec §5.2 and
 * `.context/framework/planning/f-journey-state.md`.
 *
 * The status vocabulary is dependency-free; the read queries (`queries.ts`) import
 * `@/lib/db/client`, so per B12 pure/unit tests import the specific module, not
 * this barrel.
 */
export * from '@/lib/framework/facilitation/journey/vocabulary';
export * from '@/lib/framework/facilitation/journey/queries';

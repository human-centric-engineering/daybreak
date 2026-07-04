/**
 * Journey domain — per-user runtime traversal state over an authored map: the
 * `UserJourney` / `UserNodeState` / `JourneyEvent` models (f-journey-state t-1) and,
 * from t-2, the `canRead`-guarded read queries. The deterministic engine that
 * *writes* this state is `f-engine` (feature 11). See spec §5.2 and
 * `.context/framework/planning/f-journey-state.md`.
 *
 * Barrel exports are dependency-free so far (the status vocabulary); the read
 * queries (t-2) import `@/lib/db/client`, so per B12 pure/unit tests import the
 * specific module, not this barrel, once a DB-bound export lands here.
 */
export * from '@/lib/framework/facilitation/journey/vocabulary';

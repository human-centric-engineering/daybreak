/**
 * Facilitation domain — the versioned map, per-user journey state, the
 * deterministic engine (sole writer of state), the advisory guidance layer, and
 * governance.
 *
 * The authored **map** (schema, referential validator, and version service —
 * `f-map`) and per-user **journey state** (models + status vocabulary —
 * `f-journey-state` t-1) are populated below. The engine (sole writer of state) and
 * guidance arrive in later features — see `.context/framework/planning/plan.md`
 * (11, 12) and spec §5.
 */
export * from '@/lib/framework/facilitation/map';
export * from '@/lib/framework/facilitation/journey';

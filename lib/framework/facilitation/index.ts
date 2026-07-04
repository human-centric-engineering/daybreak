/**
 * Facilitation domain — the versioned map, per-user journey state, the
 * deterministic engine (sole writer of state), the advisory guidance layer, and
 * governance.
 *
 * The authored **map** (schema, referential validator, and version service —
 * `f-map`) is populated below. Journey state / engine / guidance arrive in later
 * features — see `.context/framework/planning/plan.md` (09, 11, 12) and spec §5.
 */
export * from '@/lib/framework/facilitation/map';

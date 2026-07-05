/**
 * Framework built-in capabilities — the generic seam for registering non-module,
 * framework-owned agent tools (`get_state` / `fill_slot`, later `f-guidance`'s) into the
 * orchestration dispatcher + `ai_capability` rows. See `registry.ts` (the handler half)
 * and `sync.ts` (the `ai_capability` metadata half).
 *
 * `registry.ts` is pure; `sync.ts` imports `@/lib/db/client`. Per B12, pure/unit tests
 * import the specific module, not this barrel.
 */
export * from '@/lib/framework/capabilities/registry';
export * from '@/lib/framework/capabilities/sync';

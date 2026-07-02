/**
 * Framework "module" prompt-context contributor.
 *
 * Registered into core's context-builder seam by `initFramework()` so a chat
 * request with `contextType: "module"` gets a `LOCKED CONTEXT` block for the
 * addressed module. This is the scaffold: there are no modules yet
 * (`f-module-core` adds the `framework_module` table and the real loader), so it
 * returns a clear "not available yet" body — like core's `pattern`-not-found
 * case, rather than a blank block, so an operator who requests module context
 * before it is wired sees why it's empty. Its job in f-bootstrap is to prove the
 * boot seam wires `initFramework()` into a live core registration — see the tests.
 */

/** The chat `contextType` the framework owns (client-facing, on the chat request). */
export const MODULE_CONTEXT_TYPE = 'module';

/** Body returned by the scaffold loader until `f-module-core` supplies real content. */
export const MODULE_CONTEXT_UNAVAILABLE = 'No framework module context is available yet.';

/**
 * Load prompt context for a framework module by id (its slug). The real loader
 * (from `f-module-core`) replaces this via the registry's per-type override
 * (`registerContextContributor` is idempotent by type).
 *
 * Non-`async` (returns a resolved promise) so it satisfies the `Promise<string>`
 * contributor contract without an empty-`async` lint flag; the real loader will
 * be genuinely async.
 */
export function loadModuleContext(_id: string): Promise<string> {
  return Promise.resolve(MODULE_CONTEXT_UNAVAILABLE);
}

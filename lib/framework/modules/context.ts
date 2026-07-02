/**
 * Framework "module" prompt-context contributor.
 *
 * Registered into core's context-builder seam by `initFramework()` so a chat
 * request with `contextType: "module"` gets a `LOCKED CONTEXT` block for the
 * addressed module. This is the EMPTY scaffold: there are no modules yet
 * (`f-module-core` adds the `framework_module` table and the real loader), so it
 * returns no body. Its job in f-bootstrap is to prove the boot seam wires
 * `initFramework()` into a live core registration — see the boundary tests.
 */

/** The chat `contextType` the framework owns (client-facing, on the chat request). */
export const MODULE_CONTEXT_TYPE = 'module';

/**
 * Load prompt context for a framework module by id (its slug). Empty until
 * `f-module-core` — returns no body, which core frames as an empty
 * `LOCKED CONTEXT` block. The real loader replaces this via the registry's
 * per-type override (`registerContextContributor` is idempotent by type).
 *
 * Non-`async` (returns a resolved promise) so it satisfies the `Promise<string>`
 * contributor contract without an empty-`async` lint flag; the real loader will
 * be genuinely async.
 */
export function loadModuleContext(_id: string): Promise<string> {
  return Promise.resolve('');
}

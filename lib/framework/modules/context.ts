/**
 * Framework "module" prompt-context contributor.
 *
 * Registered into core's context-builder seam by `initFramework()` so a chat request with
 * `contextType: "module"` gets a `LOCKED CONTEXT` block for the addressed module. f-guidance
 * t-4 supplies the real loader: it composes the module's **config-relevant context** (its
 * name + one-line description, from the code registry — spec §5.4's "the module's
 * config-relevant context") for the agent's system prompt.
 *
 * **User-agnostic by necessity.** The spec also wants the user's *journey position* + *fresh
 * slots* injected here, but the core seam gives a contributor only the `id` (the module slug),
 * not the user, and caches the result per `(type, id)` for 60 s — so injecting per-user content
 * would serve one user's journey/slots to another. That injection is therefore **deferred to
 * f-guidance t-4b**, pending a Sunrise seam widening (userId in the contributor + a user-aware
 * cache) filed in `.context/framework/upstream-asks.md`. Meanwhile agents read journey position
 * and slots *per turn* through the guidance capabilities (`get_journey_state`, …), so nothing is
 * blocked — only the automatic prompt-injection defers. What ships here is exactly what is
 * user-agnostic and safe to cache per module slug.
 */

import { getRegisteredModules } from '@/lib/framework/modules/registry';

/** The chat `contextType` the framework owns (client-facing, on the chat request). */
export const MODULE_CONTEXT_TYPE = 'module';

/** Body returned when the addressed slug is not a registered module (mirrors core's
 *  `pattern`-not-found case — a clear "why it's empty", not a blank block). */
export const MODULE_CONTEXT_UNAVAILABLE = 'No framework module context is available yet.';

/**
 * Load prompt context for a framework module by id (its slug): its name + description from the
 * in-memory module registry (code-declared, so no DB read and no per-user data — safe with the
 * core seam's per-`(type, id)` cache). Returns the "unavailable" body for an unregistered slug.
 */
export function loadModuleContext(id: string): Promise<string> {
  const definition = getRegisteredModules().find((m) => m.slug === id);
  if (definition === undefined) return Promise.resolve(MODULE_CONTEXT_UNAVAILABLE);

  const body = `Module: ${definition.name}\n${definition.description}`;
  return Promise.resolve(body);
}

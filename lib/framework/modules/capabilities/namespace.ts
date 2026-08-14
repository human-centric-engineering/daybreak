/**
 * Namespacing + scope-refusal for module-declared capabilities (f-module-bindings
 * t-2, decision A8; delegated to the core seam in v1.3 Phase 1 t-1.2).
 *
 * A module author writes an ordinary `BaseCapability` with a **bare snake_case
 * slug** (e.g. `save_worksheet`). The framework presents it to the ONE global
 * capability registry under a namespaced slug, so it cannot collide with another
 * module's identically named tool, and attaches a guard so it refuses to run
 * outside its module's scope — the author writes no namespacing or scope code.
 *
 * **Nothing is wrapped.** Sunrise #398 (landed in 0.7.0) made
 * `capabilityDispatcher.register(cap, { slug, guard })` take a handler-key override
 * and a pre-execute guard, which is precisely what a wrapper was faking. So this
 * module is now three pure derivations over the author's capability — the slug, the
 * `functionDefinition`, and the scope guard — and the real instance is what gets
 * registered. That matters beyond tidiness: the dispatcher's PII check
 * (`isRedactorOverridden`) is an own-property check on the instance's prototype, and
 * a delegating wrapper passed it unconditionally. The fork used to re-assert the
 * contract against the inner capability to compensate; core now sees the true
 * subclass, so the re-assertion is gone with the wrapper.
 *
 * **One namespaced identifier, used everywhere** (reconciliation #2). The dispatcher
 * keys handlers by the tool name the LLM calls (`dispatch(toolCall.name)`), and
 * `getCapabilityDefinitions` only surfaces a capability whose `ai_capability.slug` is
 * a registered handler — so the handler key, the DB `slug`, and the
 * `functionDefinition.name` must be the SAME string (built-ins keep `slug ===
 * functionDefinition.name` for exactly this reason). That string must be
 * provider-legal: OpenAI tool names allow only `[A-Za-z0-9_-]`, so the spec's dotted
 * `<module>.<tool>` example (A8) can't be the literal identifier — we use
 * `<moduleSlug_underscored>__<toolSlug>`. It is collision-free by construction:
 * module slugs are strict kebab (no `_`, no `--`, so `-`→`_` yields no `__`) and tool
 * slugs strict snake (no `-`, no `__`), so the `__` joiner is the unambiguous split
 * point. (An underscored slug is also admin-unreachable — `slugSchema` forbids `_`.)
 *
 * Both consumers derive from here: `register.ts` (the in-memory handler) and
 * `sync.ts` (the `ai_capability` row). Same input, same identifier — which is the
 * invariant that keeps a module tool dispatchable at all.
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityGuard,
} from '@/lib/orchestration/capabilities/types';
import { decodeScope } from '@/lib/framework/shared/scope';
import type { ModuleSlug } from '@/lib/framework/shared/scope';

/** Bare tool slugs must be snake_case so they namespace to a provider-legal name. */
const TOOL_SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * The namespaced identifier for a module capability — used identically as the
 * dispatcher handler key, the `ai_capability.slug`, AND the `functionDefinition.name`
 * the LLM calls (they MUST match; see the file header). Provider-legal and
 * collision-free: `<moduleSlug_underscored>__<toolSlug>`.
 */
export function moduleCapabilitySlug(moduleSlug: string, toolSlug: string): string {
  return `${moduleSlug.replaceAll('-', '_')}__${toolSlug}`;
}

/**
 * Whether a call may run given its scope: allowed when no module scope is pinned
 * (the interim posture — nothing populates `scope.moduleSlug` until f-guidance's
 * X5 surface-scoped conversations) OR the pinned module matches. A pinned but
 * different module is refused. Pure — exhaustively unit-tested.
 */
export function isInModuleScope(context: CapabilityContext, moduleSlug: ModuleSlug): boolean {
  const pinned = decodeScope(context.scope).moduleSlug;
  return pinned === undefined || pinned === moduleSlug;
}

/** The code-owned identity of a module capability, shared by the handler and the row. */
export interface ModuleCapabilityIdentity {
  /** Handler key === `ai_capability.slug` === `functionDefinition.name`. */
  slug: string;
  /** The author's definition, renamed to the namespaced slug. */
  functionDefinition: CapabilityFunctionDefinition;
}

/**
 * Derive a module capability's namespaced identity. Throws on a non-snake_case tool
 * slug — it would not namespace to a provider-legal function name, and a boot that
 * proceeded would register a tool no provider can call.
 */
export function moduleCapabilityIdentity(
  moduleSlug: ModuleSlug,
  capability: BaseCapability
): ModuleCapabilityIdentity {
  if (!TOOL_SLUG_RE.test(capability.slug)) {
    throw new Error(
      `Module "${moduleSlug}" capability slug "${capability.slug}" must be snake_case ` +
        `(lowercase alphanumeric words joined by single underscores) so it namespaces ` +
        `to a provider-legal tool name`
    );
  }
  const slug = moduleCapabilitySlug(moduleSlug, capability.slug);
  // The LLM function name MUST equal the handler key / DB slug (the dispatcher looks
  // the handler up by the name the LLM calls) — so it is exactly the namespaced slug.
  return { slug, functionDefinition: { ...capability.functionDefinition, name: slug } };
}

/**
 * The pre-execute guard attached to a module capability's registration: refuse a
 * dispatch pinned to a different module. The dispatcher runs it after the binding
 * gate and **before** the rate limiter, so a refused call consumes no rate token, and
 * a throw fails closed — both stronger than the in-`execute()` refusal this replaced.
 *
 * The `reason` is folded verbatim into a client-visible message, so it names the
 * module (already public in the tool's own slug) and nothing internal.
 */
export function moduleScopeGuard(moduleSlug: ModuleSlug): CapabilityGuard {
  return (context) =>
    isInModuleScope(context, moduleSlug)
      ? { allow: true }
      : {
          allow: false,
          reason: `it is scoped to module "${moduleSlug}" and cannot run in another module's context`,
        };
}

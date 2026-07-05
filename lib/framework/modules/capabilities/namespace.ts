/**
 * Namespacing + scope-refusal for module-declared capabilities (f-module-bindings
 * t-2, decision A8).
 *
 * A module author writes an ordinary `BaseCapability` with a **bare snake_case
 * slug** (e.g. `save_worksheet`). The framework wraps it so it lives in the ONE
 * global capability registry without colliding with another module's identically
 * named tool, and so it refuses to run outside its module's scope — the author
 * writes no namespacing or scope code.
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
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
  CapabilitySchema,
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

/**
 * A module capability presented to the dispatcher under its namespaced slug, with a
 * provider-legal function name and automatic scope refusal. Delegates validation,
 * execution, and provenance redaction to the inner capability.
 */
class NamespacedModuleCapability extends BaseCapability {
  readonly slug: string;
  readonly functionDefinition: CapabilityFunctionDefinition;
  readonly processesPii: boolean;
  // Unused: `validate()` is overridden to delegate to the inner capability, so this
  // placeholder never runs. Present only to satisfy the abstract member.
  protected readonly schema: CapabilitySchema<unknown> = z.unknown();

  constructor(
    private readonly inner: BaseCapability,
    private readonly moduleSlug: ModuleSlug
  ) {
    super();
    this.slug = moduleCapabilitySlug(moduleSlug, inner.slug);
    // The LLM function name MUST equal the handler key / DB slug (the dispatcher
    // looks the handler up by the name the LLM calls) — so it is exactly `this.slug`.
    this.functionDefinition = { ...inner.functionDefinition, name: this.slug };
    this.processesPii = inner.processesPii;
  }

  validate(rawArgs: unknown): unknown {
    return this.inner.validate(rawArgs);
  }

  async execute(args: unknown, context: CapabilityContext): Promise<CapabilityResult> {
    if (!isInModuleScope(context, this.moduleSlug)) {
      return this.error(
        `Capability "${this.slug}" is scoped to module "${this.moduleSlug}" and cannot run in another module's context`,
        'out_of_module_scope'
      );
    }
    return this.inner.execute(args, context);
  }

  redactProvenance(
    args: unknown,
    result: CapabilityResult
  ): ReturnType<BaseCapability['redactProvenance']> {
    return this.inner.redactProvenance(args, result);
  }
}

/**
 * Wrap a module-authored capability as a namespaced, scope-aware dispatcher entry.
 * Throws on a non-snake_case tool slug (it would not namespace to a provider-legal
 * function name), and re-asserts the inner capability's PII contract: the wrapper
 * always "overrides" `redactProvenance` (it delegates), which would fool the
 * dispatcher's own PII guard, so we enforce inner's contract here instead.
 */
export function namespaceModuleCapability(
  moduleSlug: ModuleSlug,
  inner: BaseCapability
): BaseCapability {
  if (!TOOL_SLUG_RE.test(inner.slug)) {
    throw new Error(
      `Module "${moduleSlug}" capability slug "${inner.slug}" must be snake_case ` +
        `(lowercase alphanumeric words joined by single underscores) so it namespaces ` +
        `to a provider-legal tool name`
    );
  }
  if (inner.processesPii && inner.redactProvenance === BaseCapability.prototype.redactProvenance) {
    throw new Error(
      `Module "${moduleSlug}" capability "${inner.slug}" declares processesPii=true but ` +
        `does not override redactProvenance(). PII-handling capabilities must redact.`
    );
  }
  return new NamespacedModuleCapability(inner, moduleSlug);
}

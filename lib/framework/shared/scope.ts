/**
 * The framework's single scoping vocabulary.
 *
 * `moduleSlug` and `nodeKey` identify *where* in the framework a piece of work
 * is happening. The same two keys appear with the same meaning on slot
 * definitions/values, agent & workflow bindings, knowledge grants, journey
 * events, and the entries the framework writes into a capability's
 * `CapabilityContext.scope` map — the generic `Record<string, string>` carrier
 * owned by Sunrise core (see `.context/framework/planning/framework-architecture.md`
 * §7, "One scoping vocabulary").
 *
 * This module is the single owner of those types so the modules, facilitation,
 * and data-slots domains cannot drift — and so the vocabulary lives on the
 * framework side of the boundary, never in core types (Appendix B / X6). It is
 * deliberately dependency-free: it bridges to core's generic scope map by shape
 * (`Record<string, string>`), never by importing a core type.
 */

/** Stable slug of a registered module (`Module.slug`). */
export type ModuleSlug = string;

/** Stable key of a node within a published facilitation map version. */
export type NodeKey = string;

/**
 * The well-known keys the framework writes into (and reads back out of) a
 * generic `CapabilityContext.scope` map. Core names none of these; they live
 * here, on the framework side of the boundary.
 */
export const SCOPE_KEYS = {
  moduleSlug: 'moduleSlug',
  nodeKey: 'nodeKey',
} as const;

/** Union of the well-known scope-map keys. */
export type ScopeKey = (typeof SCOPE_KEYS)[keyof typeof SCOPE_KEYS];

/**
 * A framework scope: where in the framework something is happening. Both
 * members are optional — an unscoped call is the empty scope `{}`.
 */
export interface FrameworkScope {
  moduleSlug?: ModuleSlug;
  nodeKey?: NodeKey;
}

/**
 * Encode a `FrameworkScope` into the generic `Record<string, string>` shape of
 * `CapabilityContext.scope`. Undefined members are omitted, so the empty scope
 * encodes to `{}`.
 */
export function encodeScope(scope: FrameworkScope): Record<string, string> {
  const out: Record<string, string> = {};
  if (scope.moduleSlug !== undefined) out[SCOPE_KEYS.moduleSlug] = scope.moduleSlug;
  if (scope.nodeKey !== undefined) out[SCOPE_KEYS.nodeKey] = scope.nodeKey;
  return out;
}

/**
 * Decode the well-known framework keys out of a generic scope map (e.g.
 * `CapabilityContext.scope`). Unknown keys are ignored; absent keys yield
 * `undefined` members. Round-trips with `encodeScope`.
 */
export function decodeScope(map: Record<string, string> | undefined): FrameworkScope {
  const scope: FrameworkScope = {};
  const moduleSlug = map?.[SCOPE_KEYS.moduleSlug];
  const nodeKey = map?.[SCOPE_KEYS.nodeKey];
  if (moduleSlug !== undefined) scope.moduleSlug = moduleSlug;
  if (nodeKey !== undefined) scope.nodeKey = nodeKey;
  return scope;
}

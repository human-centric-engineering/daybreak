/**
 * Per-agent read/write exposure for the slot capabilities (f-slot-capture t-4, decision 8).
 *
 * A grant (`AiAgentCapability`) may carry a `customConfig` allowlist naming which slot
 * **groups** and **scopes** (`SlotDefinition.group` / `.scope`) an agent may read
 * (`get_state`) or write (`fill_slot`). The dispatcher resolves that binding on every
 * dispatch and surfaces its config as `CapabilityContext.customConfig` (Sunrise #411,
 * landed in 0.7.0), so this module **reads the context** rather than re-querying
 * `AiAgentCapability` — one indexed lookup less per capture and per `get_state`.
 *
 * Two consequences of reading the dispatcher's value, both deliberate:
 * - The dispatcher caches an agent's bindings for 5 minutes, so an operator's allowlist
 *   edit takes effect on the same cache boundary as `isEnabled` and `customRateLimit`
 *   already do — one coherent staleness window instead of two.
 * - `customConfig` is populated **only by the dispatcher** (`null` when the binding
 *   carries no config, including the synthesized default-allow binding). `undefined`
 *   therefore means the capability was executed outside the dispatch path — where the
 *   guard, the enablement check and the rate limiter were skipped too — so it **fails
 *   closed** rather than silently degrading an allowlist to permissive.
 *
 * Tri-state, by design:
 * - **no binding / `customConfig` null** → permissive (backward-compatible with every
 *   existing grant — this feature adds no restriction unless an operator opts in);
 * - **a valid config** → enforced (an absent `read`/`write` facet, or an absent
 *   `groups`/`scopes` within one, is "no restriction on that axis");
 * - **a malformed config** → **fail closed** (`ok: false`): an operator's broken allowlist
 *   must never silently widen access.
 *
 * Two layers, different strictness on purpose. The **top level** is tolerant — `customConfig`
 * is a shared bag other features may write to, so unknown top-level keys are ignored. Each
 * **facet is strict**: within `read`/`write` the only valid keys are `groups`/`scopes`, so a
 * plausible typo (`group`/`scope` singular) **rejects → fails closed** rather than silently
 * collapsing the facet to `{}` (allow-all on that axis) — the fail-open trap for an allowlist.
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';
import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';

/** One facet's allowlist — restrict by slot `group` and/or `scope`. Strict: an unknown key
 *  (e.g. a `groups`/`scopes` typo) rejects, so a broken restriction fails closed. */
const facetSchema = z
  .object({
    groups: z.array(z.string()).optional(),
    scopes: z.array(z.string()).optional(),
  })
  .strict();

export const exposureConfigSchema = z.object({
  read: facetSchema.optional(),
  write: facetSchema.optional(),
});

export type ExposureConfig = z.infer<typeof exposureConfigSchema>;
export type ExposureFacet = z.infer<typeof facetSchema>;

/** Permissive — no restriction on either facet. */
const PERMISSIVE: ExposureConfig = {};

export type ExposureResult = { ok: true; config: ExposureConfig } | { ok: false };

/**
 * Validate the agent's exposure allowlist from the binding config the dispatcher put on
 * the execution context. Returns a permissive config when the binding carries none
 * (`null`); a validated config when present; or `{ ok: false }` when the config is
 * malformed, or when the context carries no resolved binding at all (`undefined` — an
 * execution that bypassed the dispatcher). Callers fail closed on `{ ok: false }`.
 *
 * `slug` is used for the diagnostic log only — the config is already the one the
 * dispatcher resolved for this capability's own binding.
 */
export function resolveExposureConfig(context: CapabilityContext, slug: string): ExposureResult {
  const customConfig = context.customConfig;
  if (customConfig === undefined) {
    logger.warn('Slot exposure: no resolved binding on the context; failing closed', {
      slug,
      agentId: context.agentId,
    });
    return { ok: false };
  }
  if (customConfig === null) return { ok: true, config: PERMISSIVE };
  const parsed = exposureConfigSchema.safeParse(customConfig);
  if (!parsed.success) return { ok: false };
  return { ok: true, config: parsed.data };
}

/**
 * Does a slot with this `group`/`scope` pass the facet's allowlist? An undefined facet (no
 * restriction) always passes. Within a facet, `groups`/`scopes` are ANDed, and each is a
 * membership test — a slot with a `null` group/scope (e.g. an open-mint slug, which has no
 * definition) can never satisfy a restriction that names groups/scopes, so it is refused.
 */
export function facetAllows(
  facet: ExposureFacet | undefined,
  group: string | null,
  scope: string | null
): boolean {
  if (facet === undefined) return true;
  if (facet.groups !== undefined && (group === null || !facet.groups.includes(group))) return false;
  if (facet.scopes !== undefined && (scope === null || !facet.scopes.includes(scope))) return false;
  return true;
}

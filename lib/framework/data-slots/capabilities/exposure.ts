/**
 * Per-agent read/write exposure for the slot capabilities (f-slot-capture t-4, decision 8).
 *
 * A grant (`AiAgentCapability`) may carry a `customConfig` allowlist naming which slot
 * **groups** and **scopes** (`SlotDefinition.group` / `.scope`) an agent may read
 * (`get_state`) or write (`fill_slot`). The dispatcher never reads `customConfig`
 * (`getAgentBinding` consumes only `isEnabled` + `customRateLimit`, and
 * `CapabilityContext` carries no `customConfig`), so each capability **re-reads its own
 * binding** at execute time — one indexed lookup served by `@@unique([agentId, capabilityId])`.
 * Zero core edit (mirrors `f-module-bindings`); the cleaner path — Sunrise surfacing the
 * binding config into `CapabilityContext` — is filed in `upstream-asks`.
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
import { prisma } from '@/lib/db/client';

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
 * Load and validate the agent's exposure allowlist for a capability slug. Returns a
 * permissive config when there is no binding or no `customConfig`; a validated config when
 * present; or `{ ok: false }` when `customConfig` is malformed (caller fails closed).
 */
export async function loadExposureConfig(agentId: string, slug: string): Promise<ExposureResult> {
  const binding = await prisma.aiAgentCapability.findFirst({
    where: { agentId, capability: { slug } },
    select: { customConfig: true },
  });
  if (!binding || binding.customConfig === null || binding.customConfig === undefined) {
    return { ok: true, config: PERMISSIVE };
  }
  const parsed = exposureConfigSchema.safeParse(binding.customConfig);
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

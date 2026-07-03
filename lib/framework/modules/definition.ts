/**
 * `ModuleDefinition` — the code half of a framework module (spec §4.1, decision A3).
 *
 * A module is code-first: this object, registered in code via `registerModule()`,
 * declares everything *intrinsic* to the module — its stable identity and the
 * admin-tunable parameters it accepts. The database half (`framework_module`,
 * synced from the registry at boot) holds only what an *operator* controls
 * (status, availability window, config values). Code describes structure; the row
 * describes operation.
 *
 * Scope is deliberately minimal for `f-module-core`: identity + `configSchema`.
 * Fields the later features own are added *by those features*, so no unused
 * surface lands early:
 *   - `capabilities` / `agentRoles`  → `f-module-bindings` (A6/A8)
 *   - `slotDefinitions`              → `f-slots` (§6)
 *   - `events`                       → `f-engagement` (A9)
 */

import type { z } from 'zod';
import type { ModuleSlug } from '@/lib/framework/shared/scope';

export interface ModuleDefinition {
  /** Stable identity, referenced everywhere (matches the synced `Module.slug`). */
  slug: ModuleSlug;

  /** Human-readable name; the default for the row's display name. */
  name: string;

  /** One-line description of what the module is. */
  description: string;

  /**
   * The module's admin parameters as a Zod schema (decision A4). The generic
   * admin config form renders from it and the API validates operator input with
   * the *same* schema — new module, new parameters, zero admin-UI work. Stored
   * values live on `Module.config` (validated in `f-module-config`, not here).
   *
   * Typed `z.ZodTypeAny` — an arbitrary per-module schema — mirroring the
   * existing `configSchema` field on outbound channel definitions
   * (`lib/orchestration/outbound/types.ts`).
   */
  configSchema: z.ZodTypeAny;
}

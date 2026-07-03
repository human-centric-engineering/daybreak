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
 * Scope grows one field per consuming feature, so no unused surface lands early:
 *   - `slotDefinitions`              → `f-slots` (§6) — added below
 *   - `capabilities` / `agentRoles`  → `f-module-bindings` (A6/A8)
 *   - `events`                       → `f-engagement` (A9)
 */

import type { z } from 'zod';
import type { ModuleSlug } from '@/lib/framework/shared/scope';
import type { SlotDefinitionInput } from '@/lib/framework/data-slots/definition';

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

  /**
   * The data-slots this module owns (spec §6.1, decision D-series). Declared in
   * code and reconciled into `framework_slot_definition` rows at boot, each stamped
   * `scope = module:<slug>` (`data-slots/sync.ts`). Optional — a module that
   * captures no per-user data declares none. The `fill_slot` / `get_state`
   * capabilities that read/write these are a later feature (`f-slot-capture`).
   */
  slotDefinitions?: SlotDefinitionInput[];
}

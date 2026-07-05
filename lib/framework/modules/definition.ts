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
 *   - `slotDefinitions`  → `f-slots` (§6) — added below
 *   - `agentRoles`       → `f-module-bindings` t-1 (A6) — added below
 *   - `capabilities`     → `f-module-bindings` t-2 (A8)
 *   - `events`           → `f-engagement` (A9)
 */

import type { z } from 'zod';
import type { ModuleSlug } from '@/lib/framework/shared/scope';
import type { SlotDefinitionInput } from '@/lib/framework/data-slots/definition';
import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';

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

  /**
   * The named agent *seats* this module offers (spec §4.2, decision A6). An admin
   * binds an ordinary `AiAgent` into a seat via a `ModuleAgentBinding` row; the
   * `role` on that row must be one of the strings declared here, validated at bind
   * time (`bindings/service.ts`) — a seat is a code-declared contract, not an
   * operator free-text field. A universal agent is one bound into many modules'
   * seats; a module-specific agent is bound into one. Nothing on `AiAgent` changes
   * (A6: agents bind with roles, never owned).
   *
   * Free-form strings, not an enum (X1): a new seat is a code edit to this array,
   * never a migration. Optional — a module with no agent seats declares none, and
   * binding any agent to it is then rejected. Example: `['companion', 'reviewer']`.
   */
  agentRoles?: string[];

  /**
   * The capabilities (agent tools) this module contributes (spec §4.2, decision A8).
   * Each is an ordinary `BaseCapability` authored with a **bare snake_case slug**
   * (e.g. `save_worksheet`); the framework registers it into the **one global
   * capability registry** namespaced by module slug (`<module-slug>.<tool>`), so two
   * modules never collide on a generic tool name. No second capability system.
   *
   * Registration is two-layer (both from `syncFramework()`, after modules register):
   * the in-memory dispatcher handler, and a code-projected `ai_capability` row
   * (`category: "module"`, `isSystem: true`) so an agent can be granted the tool the
   * ordinary way. A capability learns _which module scope_ it runs in via the generic
   * `CapabilityContext.scope` map and refuses out-of-scope automatically (the
   * framework wraps it; the author writes no scope code).
   *
   * Optional — a module with no tools declares none. Bare slugs must be snake_case
   * (`^[a-z0-9]+(_[a-z0-9]+)*$`) so they namespace to a provider-legal function name.
   */
  capabilities?: BaseCapability[];
}

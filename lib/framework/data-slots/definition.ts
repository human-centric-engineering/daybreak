/**
 * `SlotDefinitionInput` — the code half of a slot definition (spec §6.1).
 *
 * A slot definition is authored configuration: *what* the system aims to learn
 * about a user. For `f-slots` the only source is a module — a `ModuleDefinition`
 * declares its `slotDefinitions`, which the boot sync reconciles into
 * `framework_slot_definition` rows scoped `module:<slug>` (app-seeded *global*
 * slots are an additive seam a later feature adds; not built here).
 *
 * `scope` is deliberately **absent** from the input: a module never names its own
 * scope — the collector stamps `module:<module.slug>` so the provenance can't be
 * spoofed or mistyped. The classifier fields are optional; the collector resolves
 * each unset one to its documented default (mirroring the DB column defaults) so a
 * definition is a slug + group + description at minimum.
 *
 * Definition (authored config, a version chain elsewhere) vs value (insert-only
 * user data) is the A2 split; the value side is `values.ts` / `SlotValue`.
 */

import type {
  SlotVisibility,
  SlotMode,
  SlotDataType,
  SlotSensitivity,
} from '@/lib/framework/data-slots/vocabulary';

export interface SlotDefinitionInput {
  /** Stable, globally-unique identity (matches `SlotValue.slotSlug`). */
  slug: string;

  /** Thematic cluster this slot belongs to (e.g. `goals`, `preferences`). */
  group: string;

  /** What the slot means — also prompt material for the capture agent. */
  description: string;

  /** Who sees it — `open` (user sees/edits) or `hidden` (system-only). Default `open`. */
  visibility?: SlotVisibility;

  /** Capture mode — `targeted` (pre-declared) or `open` (minted at runtime). Default `targeted`. */
  mode?: SlotMode;

  /** Typed form for gate conditions & analytics (D2). Default `text`. */
  dataType?: SlotDataType;

  /** GDPR sensitivity class driving masking/retention/exposure (D3). Default `standard`. */
  sensitivity?: SlotSensitivity;

  /** Sequencing input for targeted-mode capture (higher = asked sooner). Default `0`. */
  priorityWeight?: number;
}

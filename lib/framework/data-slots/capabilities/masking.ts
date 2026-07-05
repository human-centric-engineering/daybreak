/**
 * Sensitivity-driven masking-before-storage (f-slot-capture t-3, decision 6). Pure.
 *
 * Keyed on the slot definition's `sensitivity` (`standard | sensitive | special_category`),
 * applied to the capture **before** `appendSlotValue`, so what lands at rest is already
 * minimised:
 * - `standard` / `sensitive` → store as captured. (The durable *audit trace* is masked
 *   separately by `redactProvenance` — decision 5, a different axis.)
 * - `special_category` (strictest) → the raw prose `value` never lands at rest: it becomes
 *   a masked sentinel, and the typed `valueJson` is kept ONLY when it is a **non-prose gate
 *   value** (a `text` slot's typed form *is* the prose, so it is dropped too). Gates read
 *   `valueJson`, so a typed special-category slot still gates; a free-text one keeps only
 *   the fact that it was filled.
 */

import type { Prisma } from '@prisma/client';
import { redactedString } from '@/lib/security/redact';
import { SLOT_SENSITIVITY, SLOT_DATA_TYPE } from '@/lib/framework/data-slots/vocabulary';

/** The `{ value, valueJson }` pair as it will be stored. `valueJson` is `null` when there
 *  is no typed gate value. */
export interface SlotStoredForm {
  value: string;
  valueJson: Prisma.InputJsonValue | null;
}

/** Transform a capture into its stored form per the slot's sensitivity + dataType. */
export function slotMaskingPolicy(
  sensitivity: string,
  dataType: string,
  form: SlotStoredForm
): SlotStoredForm {
  if (sensitivity !== SLOT_SENSITIVITY.special_category) return form;
  const keepTyped = dataType !== SLOT_DATA_TYPE.text && form.valueJson !== null;
  return {
    value: redactedString('special_category'),
    valueJson: keepTyped ? form.valueJson : null,
  };
}

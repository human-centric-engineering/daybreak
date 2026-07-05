/**
 * Typed slot values (f-slot-capture t-3) — the `SLOT_DATA_TYPE` ↔ typed-value bridge.
 * Pure. Two uses, one map (decision 7):
 * - `validateTypedValue` — the cheap **local** check on the common path: is the
 *   agent-supplied `valueJson` a valid instance of the slot's `dataType`? (no LLM).
 * - `typedValueSchema` — the JSON Schema a prose→typed **extraction** forwards as its
 *   enforced `responseSchema` (t-3b, #307). Built now so both paths share one map.
 */

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { SLOT_DATA_TYPE } from '@/lib/framework/data-slots/vocabulary';

/**
 * JSON Schema for a slot's typed `valueJson`, by `dataType` — the shape a prose→typed
 * extraction is constrained to (t-3b). `text` is a plain string; `json` is an
 * object-rooted value (the portable root for provider-native structured output).
 */
export function typedValueSchema(dataType: string): Record<string, unknown> {
  switch (dataType) {
    case SLOT_DATA_TYPE.number:
      return { type: 'number' };
    case SLOT_DATA_TYPE.boolean:
      return { type: 'boolean' };
    case SLOT_DATA_TYPE.date:
      return { type: 'string', format: 'date-time' };
    case SLOT_DATA_TYPE.json:
      return { type: 'object' };
    default: // text
      return { type: 'string' };
  }
}

/**
 * ISO-8601 date (`YYYY-MM-DD`) or datetime — the only date shape a slot may store.
 * The gate evaluator compares string slot values **lexicographically** for `gte`/`lte`
 * (`conditions.ts` `compareScalar`), which equals chronological order ONLY for ISO-8601.
 * A locale form like `03/05/2026` is `Date.parse`-able but sorts wrongly, so we reject it
 * here rather than store a mis-comparable value — this also matches the `date-time` schema
 * `typedValueSchema` advertises to a t-3b extraction.
 */
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const VALIDATORS: Record<string, z.ZodType> = {
  [SLOT_DATA_TYPE.number]: z.number().finite(),
  [SLOT_DATA_TYPE.boolean]: z.boolean(),
  [SLOT_DATA_TYPE.date]: z
    .string()
    .regex(ISO_8601, 'not an ISO-8601 date')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'not a valid date'),
  [SLOT_DATA_TYPE.json]: z.record(z.string(), z.unknown()),
  [SLOT_DATA_TYPE.text]: z.string(),
};

/**
 * Validate an agent-supplied typed value against the slot's `dataType`. Returns the
 * Zod-validated JSON value on success, or `null` when it is absent or the wrong shape —
 * the gap a t-3b prose→typed extraction fills. Unknown dataTypes fall back to `text`.
 */
export function validateTypedValue(dataType: string, raw: unknown): Prisma.InputJsonValue | null {
  if (raw === undefined) return null;
  const validator = VALIDATORS[dataType] ?? VALIDATORS[SLOT_DATA_TYPE.text];
  const result = validator.safeParse(raw);
  // `result.data` is Zod-validated JSON (number | boolean | string | object) — a JSON value.
  return result.success ? (result.data as Prisma.InputJsonValue) : null;
}

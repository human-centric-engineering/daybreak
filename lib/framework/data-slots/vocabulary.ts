/**
 * Slot vocabulary — the free-form `String` value sets for `SlotDefinition`'s
 * classifier columns (spec §6.1).
 *
 * Every slot classifier (`scope`, `visibility`, `mode`, `dataType`, `sensitivity`)
 * is stored as a free-form `String` on the row — convention X1: no Prisma enum, so
 * a new value is never a migration and forks merge cleanly. Code that reads or
 * writes these shares the constants here so a typo can't silently mint an
 * unrecognised classifier. The allowed-value comments in the Prisma model and here
 * are the same list; keep them in step.
 */

/**
 * Where a slot lives. `global` (person-level, app-seeded) and `facilitation` are
 * fixed strings; module-owned slots use the `module:<slug>` convention minted by
 * {@link moduleSlotScope} (an open string, so a future subject/party scope is
 * additive — spec §7). `SlotDefinition.scope` defaults to `global`.
 */
export const SLOT_SCOPE = {
  global: 'global',
  facilitation: 'facilitation',
} as const;

/** The `module:` prefix for a module-owned slot's `scope` (e.g. `module:onboarding`). */
export const SLOT_SCOPE_MODULE_PREFIX = 'module:';

/** Build the `scope` value for a slot owned by the module with this slug. */
export function moduleSlotScope(moduleSlug: string): string {
  return `${SLOT_SCOPE_MODULE_PREFIX}${moduleSlug}`;
}

/** Whether the user sees/edits the slot (`open`) or it is system-only (`hidden`). */
export const SLOT_VISIBILITY = {
  open: 'open',
  hidden: 'hidden',
} as const;

/** Capture mode: a pre-declared slot (`targeted`) or one minted at runtime (`open`). */
export const SLOT_MODE = {
  targeted: 'targeted',
  open: 'open',
} as const;

/**
 * The typed form of a slot's value — gives gate conditions and analytics a typed
 * handle (`valueJson`) so nothing ever string-parses the prose `value` (D2).
 */
export const SLOT_DATA_TYPE = {
  text: 'text',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  json: 'json',
} as const;

/**
 * GDPR sensitivity class (D3). Drives masking-before-storage, retention, exposure
 * defaults, and consent — `special_category` (health, minors) gets the strictest
 * treatment by default. The masking itself lives in the `fill_slot` capability
 * (f-slot-capture); this classification is what it keys on.
 */
export const SLOT_SENSITIVITY = {
  standard: 'standard',
  sensitive: 'sensitive',
  special_category: 'special_category',
} as const;

/** A known slot scope literal (`global` | `facilitation`; module scopes are dynamic). */
export type SlotScope = (typeof SLOT_SCOPE)[keyof typeof SLOT_SCOPE];
/** A known slot visibility literal. */
export type SlotVisibility = (typeof SLOT_VISIBILITY)[keyof typeof SLOT_VISIBILITY];
/** A known slot capture-mode literal. */
export type SlotMode = (typeof SLOT_MODE)[keyof typeof SLOT_MODE];
/** A known slot data-type literal. */
export type SlotDataType = (typeof SLOT_DATA_TYPE)[keyof typeof SLOT_DATA_TYPE];
/** A known slot sensitivity literal. */
export type SlotSensitivity = (typeof SLOT_SENSITIVITY)[keyof typeof SLOT_SENSITIVITY];

/**
 * Module status vocabulary.
 *
 * `Module.status` is a free-form `String` on the row (convention X1 — no Prisma
 * enum, so a new status is never a migration), but the code that reads or writes
 * status shares these constants so a typo can't silently produce a module that is
 * never live. Only `active` gates liveness (see `isModuleLive`); the others are
 * lifecycle stages an operator moves a module through.
 */
export const MODULE_STATUS = {
  /** Not yet published; never live. The synced row's default. */
  draft: 'draft',
  /** Published and eligible for liveness (still subject to flag + window + entitlement). */
  active: 'active',
  /** Configured for a future window but not yet switched on; never live until `active`. */
  scheduled: 'scheduled',
  /** Withdrawn; never live. Row retained. */
  retired: 'retired',
} as const;

/** A known module status value. Status is stored free-form; this is the code-side vocabulary. */
export type ModuleStatus = (typeof MODULE_STATUS)[keyof typeof MODULE_STATUS];

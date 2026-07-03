/**
 * Module liveness — the pure "is this module on, at all?" predicate (spec §4.1,
 * decision A5).
 *
 * Answers status × feature-flag × availability-window (× an optional entitlement
 * predicate, decision C1). It deliberately does NOT answer "is it open to THIS
 * user, right now?" — that journey-gating question belongs to the facilitation
 * layer (§5). Keeping the two in separate layers is what stops limited-time
 * windows, flag rollouts, and journey gating from tangling.
 *
 * Pure and total: it takes fully-resolved inputs — the row's liveness fields, a
 * resolved flag map, and `now` — exactly as the facilitation engine takes `now`
 * (no DB, no clock read, no feature-flag-lib reach-in). Same inputs always give the
 * same verdict, and every branch is exhaustively unit-testable.
 */

import { MODULE_STATUS } from '@/lib/framework/modules/status';

/**
 * The subset of a `Module` row that determines liveness. The Prisma-generated
 * `Module` type structurally satisfies this, so callers pass the row directly; the
 * narrow shape keeps the predicate decoupled from the full row (config, timestamps).
 */
export interface ModuleLivenessFields {
  status: string;
  featureFlagName: string | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
}

/** Why a module is not live — the first failing gate (gates are checked most-fundamental first). */
export type ModuleLockReason = 'status' | 'flag' | 'window' | 'entitlement';

/** The liveness verdict. `reason` is present iff `live` is false. */
export type ModuleLiveness = { live: true } | { live: false; reason: ModuleLockReason };

/**
 * Compute whether a module is live.
 *
 * @param module      the module's liveness fields (a `Module` row satisfies this).
 * @param flags       resolved feature flags — `flags[name] === true` means enabled.
 *                    The caller resolves these (e.g. via Sunrise's flag lib); an
 *                    absent or non-`true` entry counts as disabled.
 * @param now         the reference instant, caller-supplied so the function stays pure.
 * @param entitlement optional predicate (decision C1): when supplied it must return
 *                    `true` for the module to be live. Omitted ⇒ no entitlement
 *                    gating — the single-tier default. Evaluated LAST and lazily, so
 *                    it runs only for an otherwise-live module.
 *
 * Gates are evaluated most-fundamental first (status → flag → window → entitlement);
 * the first failure determines `reason`.
 */
export function isModuleLive(
  module: ModuleLivenessFields,
  flags: Record<string, boolean>,
  now: Date,
  entitlement?: () => boolean
): ModuleLiveness {
  // 1. Status — the operator's explicit on-switch. Only `active` is ever live.
  if (module.status !== MODULE_STATUS.active) {
    return { live: false, reason: 'status' };
  }

  // 2. Feature flag — if bound, it must be enabled. An unbound module (null) skips this.
  if (module.featureFlagName !== null && flags[module.featureFlagName] !== true) {
    return { live: false, reason: 'flag' };
  }

  // 3. Availability window — inclusive on both ends; a null bound is open-ended.
  if (module.availableFrom !== null && now < module.availableFrom) {
    return { live: false, reason: 'window' };
  }
  if (module.availableUntil !== null && now > module.availableUntil) {
    return { live: false, reason: 'window' };
  }

  // 4. Entitlement (C1) — the paid-tier seam. Absent ⇒ no gating. Lazy: only an
  // otherwise-live module ever evaluates the predicate.
  if (entitlement !== undefined && !entitlement()) {
    return { live: false, reason: 'entitlement' };
  }

  return { live: true };
}

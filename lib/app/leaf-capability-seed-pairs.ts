/**
 * Leaf-app capability seed pairs — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) that seeds capabilities names the class for each slug here, and
 * lists any seed of its own the strict mock client cannot run (Sunrise #1013; the contract is the
 * docblock of `lib/app/capability-seed-pairs.ts`). Daybreak keeps this empty: it is the leaf's
 * seam, reserved so a leaf's entries merge cleanly on upgrade.
 *
 * Spread by `lib/app/capability-seed-pairs.ts` into `APP_CAPABILITY_PAIRS` and
 * `APP_UNCHECKED_SEEDS`, beside the framework's own entry for `_framework/000-framework-boot.ts`.
 * Test-only: nothing at runtime reads it.
 *
 * ```ts
 * import { WithdrawTaskCapability } from '@/lib/tasks/capabilities/withdraw-task';
 *
 * export const LEAF_CAPABILITY_PAIRS: readonly AppCapabilityPair[] = [
 *   { slug: 'withdraw_task', instance: new WithdrawTaskCapability() },
 * ];
 * ```
 */
import type { AppCapabilityPair } from '@/lib/app/capability-seed-pairs';

/** Capability pairs the leaf adds. Daybreak ships `[]`. */
export const LEAF_CAPABILITY_PAIRS: readonly AppCapabilityPair[] = [];

/** Leaf seeds the parity test cannot run, keyed by path under `prisma/seeds/`, each with why. */
export const LEAF_UNCHECKED_SEEDS: Readonly<Record<string, string>> = {};

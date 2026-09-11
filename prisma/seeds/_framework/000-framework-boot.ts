/**
 * Framework boot, for seed runs (#158).
 *
 * A standalone `db:seed` — what `db:reset` and CI run — never boots the app, so
 * `initFramework() → initLeafApp() → syncFramework()` never runs and the `Module`
 * rows, their slot definitions and the framework capability rows do not exist. A
 * leaf that seeds framework *configuration* (activating a module, binding an
 * agent, publishing a map that references one) then has nothing to operate on.
 * This unit closes that gap so a leaf needs no boot code of its own.
 *
 * ## The directory name is load-bearing: `_framework/`, not `framework/`
 *
 * `prisma/runner.ts` runs units in the lexicographic order of their path relative
 * to `seeds/`, and ASCII puts digits (`0x30`) < `_` (`0x5F`) < lowercase letters
 * (`0x61`). So this sorts:
 *
 *   - **after** every core `NNN-*.ts` at the top level — `001-system-owner`'s
 *     service account exists by the time anything here runs; and
 *   - **before** any leaf directory named `app-…` — the leaf's own seeds find
 *     the rows already in place.
 *
 * The sibling `prisma/seeds/framework/` sorts *after* the leaf directories, fine for
 * what lives there (it depends on core only) and fatal here. Renaming this
 * directory would break the ordering silently — no error, just a leaf seed that
 * cannot find a module. `tests/unit/prisma/framework-boot-seed.test.ts` pins it.
 *
 * ## This unit is the composer, deliberately
 *
 * It touches both tiers — `@/lib/framework` for the boot sequence and
 * `@/lib/app/leaf-bootstrap` for the leaf's module registration — which is exactly
 * what `lib/app/bootstrap.ts` does at server boot. It can, because `prisma/seeds/`
 * is subject to neither the core→framework import ban (lifted for framework/leaf
 * seed dirs in #157) nor the framework→leaf `leafBan`. `syncFrameworkForSeed()`
 * cannot compose the leaf itself: it lives in `lib/framework/**`, which must not
 * import upward into `@/lib/app/**`.
 *
 * ## It runs once, ever — and that is not the whole story
 *
 * The runner skips a unit whose source hash matches its `SeedHistory` row, so this
 * re-runs only when its own source changes. Fresh database, `db:reset` and CI are
 * all fine. An **incremental `db:seed` after a leaf adds a module** is not: this is
 * skipped, the new `Module` row is never synced, and the leaf's new seed fails.
 *
 * Two different remedies, because the two cases differ:
 *
 *   - **A leaf adding a module** also adds a seed to configure it, so it calls
 *     `syncFrameworkForSeed()` at the top of that seed's `run()` — that unit's hash
 *     changes when the leaf edits it. See `lib/framework/seed.ts`.
 *   - **Daybreak adding a framework capability** has no such seed to hook into, so
 *     this unit declares `hashInputs` over the framework's registration sources
 *     (below) and re-runs itself when they change.
 */

import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

import type { SeedUnit } from '@/prisma/runner';
import { syncFrameworkForSeed } from '@/lib/framework/seed';
import { initLeafApp } from '@/lib/app/leaf-bootstrap';

/**
 * The framework's capability source directories, relative to this file.
 *
 * Enumerated rather than listed file-by-file, because the failure this closes is
 * an EDIT to an existing capability — a changed slug, description or parameter
 * schema, all of which `syncFrameworkCapabilities()` propagates to the
 * `ai_capability` row. Naming only the barrels caught a capability being *added*
 * (which edits `index.ts`) and missed every later edit to it.
 */
const CAPABILITY_DIRS = [
  '../../../lib/framework/data-slots/capabilities',
  '../../../lib/framework/guidance/capabilities',
  '../../../lib/framework/engagement/capabilities',
  '../../../lib/framework/facilitation/emergence/capabilities',
];

/**
 * Every `.ts` file in {@link CAPABILITY_DIRS}, sorted, as paths relative to this
 * file — the shape `hashInputs` takes.
 *
 * **Sorted deliberately.** `readdirSync` order is filesystem-dependent, and the
 * runner hashes these in the order given, so an unsorted list would produce a
 * different hash on a different machine and re-run the seed for no reason.
 *
 * Throws at import time if a directory is missing. The runner imports this module
 * before hashing, so that surfaces as a loud seed failure rather than a silently
 * shorter hash input — which is the whole failure mode this mechanism exists to
 * prevent.
 */
function capabilitySources(): string[] {
  return CAPABILITY_DIRS.flatMap((dir) =>
    // RECURSIVE. A non-recursive read would miss a capability in a nested
    // subdirectory — reintroducing, one level down, exactly the "covers less than
    // it claims" defect this function exists to fix. No such subdirectory exists
    // today; the point is that adding one must not silently reopen the hole.
    // Returned names use `/` separators on POSIX and `\` on Windows, so they are
    // normalised before being joined into a relative path the runner can resolve.
    readdirSync(join(__dirname, dir), { recursive: true })
      .map((name) => String(name).split(sep).join('/'))
      .filter((name) => name.endsWith('.ts'))
      .sort()
      .map((name) => `${dir}/${name}`)
  );
}

const unit: SeedUnit = {
  name: 'framework-boot',
  // Fold the framework's own registration sources into this unit's content hash,
  // so editing them re-runs it (see "It runs once, ever" above).
  //
  // Without this, the once-ever property bites DAYBREAK as well as a leaf — and
  // worse, because the documented remedy does not apply. A leaf that adds a module
  // also adds a seed for it, and can call `syncFrameworkForSeed()` from that seed's
  // own `run()`. Add a framework CAPABILITY, though, and there is no seed of your
  // own to hook into: `ai_capability` row never appears on an existing dev
  // database, and the tool cannot be granted to an agent, with nothing to edit to
  // fix it short of touching this file.
  //
  // `index.ts` covers a new capability GROUP (it is where each is registered);
  // every capability SOURCE FILE covers the rest — a capability added inside an
  // existing group (which does not touch `lib/framework/index.ts`) and, the case
  // the barrels alone missed, an EDIT to a capability that already exists.
  //
  // That last one is not theoretical: `syncFrameworkCapabilities()` propagates
  // `name`, `description` and the parameter schema to the `ai_capability` row on
  // change, so editing `data-slots/capabilities/get-state.ts` changes what the row
  // should say — while touching no barrel, so the seed was skipped and the row
  // silently went stale on every existing dev database.
  //
  // Adding a fifth group still means editing `lib/framework/index.ts` AND adding
  // its directory to CAPABILITY_DIRS above.
  hashInputs: ['../../../lib/framework/index.ts', ...capabilitySources()],
  async run({ logger }) {
    // Throws on failure rather than logging and continuing — the difference from
    // `initApp()`, and the point of the seed-specific entry point. A sync that
    // failed silently here would be recorded as applied and strand every seed
    // after it behind a missing `Module` row.
    await syncFrameworkForSeed({ registerLeaf: initLeafApp });

    logger.info(
      'Framework synced for seeding — module, slot-definition and capability rows are current.'
    );
  },
};

export default unit;

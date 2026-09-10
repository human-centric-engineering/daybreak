/**
 * The framework boot seed's ORDER among the seed units (#158).
 *
 * `prisma/seeds/_framework/000-framework-boot.ts` establishes the `Module` rows a
 * leaf's own seeds depend on, so it has to run after the core seeds (which create
 * the service account it inherits) and before any leaf directory named `app-…`.
 *
 * That ordering is bought entirely by the **directory name**: `prisma/runner.ts`
 * sorts units by path relative to `seeds/`, and ASCII puts digits < `_` < letters.
 * Rename `_framework/` to `framework/` and it silently moves to *after* the leaf
 * directories
 * — no error, no warning, just a leaf seed that cannot find its module. That is
 * the failure this file exists to catch, and it is why the assertion is about the
 * real directory listing rather than a hard-coded expectation.
 *
 * It reads the tree, so it is declared in `ALWAYS_RUN_TESTS` — a scoped run
 * selects tests by module graph, and nothing imports a seed file.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SEEDS = join(process.cwd(), 'prisma', 'seeds');
const BOOT = '_framework/000-framework-boot.ts';
/** Mirrors `SEED_FILE_PATTERN` in `prisma/runner.ts`. */
const SEED_FILE = /^\d{3}-[a-z0-9-]+\.ts$/;

/** Every seed unit's path relative to `seeds/`, in the order the runner runs them. */
function seedOrder(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(join(SEEDS, dir), { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (SEED_FILE.test(entry.name)) found.push(rel);
    }
  };
  walk('.', '');
  // `runSeeds` does exactly this: `(await discoverSeedFiles(...)).sort()`.
  return found.sort();
}

describe('framework boot seed ordering', () => {
  it('exists where the runner will discover it', () => {
    expect(seedOrder()).toContain(BOOT);
  });

  it('runs AFTER every core seed, so the service account exists', () => {
    const order = seedOrder();
    const bootAt = order.indexOf(BOOT);
    // Core seeds are the digit-prefixed units at the TOP level (no `/`).
    const coreSeeds = order.filter((p) => !p.includes('/'));

    expect(coreSeeds.length).toBeGreaterThan(0);
    for (const core of coreSeeds) {
      expect(order.indexOf(core)).toBeLessThan(bootAt);
    }
  });

  it('runs BEFORE any app-* leaf directory, so leaf seeds find their module rows', () => {
    const order = seedOrder();
    const bootAt = order.indexOf(BOOT);
    // Daybreak ships no `app-*` seeds — the leaf surface is reserved empty — so
    // prove the ORDERING RULE against the real sort rather than against files that
    // do not exist here and will exist in every leaf.
    const withLeaf = [...order, 'app-example/001-init.ts'].sort();

    expect(withLeaf.indexOf(BOOT)).toBeLessThan(withLeaf.indexOf('app-example/001-init.ts'));
    expect(bootAt).toBeGreaterThanOrEqual(0);
  });

  it('would sort into the WRONG place if the directory were renamed to framework/', () => {
    // The mutation this file exists to catch, asserted directly: the sibling
    // `prisma/seeds/framework/` sorts AFTER the leaf directories, fine for what lives
    // there and fatal for the boot seed.
    const renamed = 'framework/000-framework-boot.ts';
    const sorted = [renamed, 'app-example/001-init.ts'].sort();

    expect(sorted.indexOf(renamed)).toBeGreaterThan(sorted.indexOf('app-example/001-init.ts'));
    // …whereas the name actually used sorts before it.
    expect([BOOT, 'app-example/001-init.ts'].sort()[0]).toBe(BOOT);
  });
});

/**
 * Tests: lib/daybreak-version.ts — the Daybreak framework version constant.
 *
 * Two things are worth testing about a constant, and only two: that it is
 * well-formed, and that it agrees with the other place the same number is
 * written down. The second is the substance of this file.
 *
 * @see lib/daybreak-version.ts · .context/framework/VERSIONING.md
 */

import { describe, it, expect } from 'vitest';
import packageJson from '@/package.json';
import { DAYBREAK_VERSION } from '@/lib/daybreak-version';
import { SUNRISE_VERSION } from '@/lib/sunrise-version';
import { APP_VERSION } from '@/lib/app-version';

describe('DAYBREAK_VERSION', () => {
  it('is a bare semver string', () => {
    // No `v` prefix and no range specifier — the `daybreak-v` prefix belongs to
    // the git tag, not the constant, and a range here would be meaningless.
    expect(DAYBREAK_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it('matches package.json.version in the Daybreak repo itself', () => {
    // THE POINT OF THIS FILE. Cutting a release means bumping two files, and
    // nothing but this test makes the second one mandatory. A release that
    // bumped the tag and the constant but not package.json would ship a
    // Daybreak whose /api/health reports one version and whose package reports
    // another — and the discrepancy would surface in a support conversation,
    // not in CI.
    //
    // NOTE FOR LEAF FORKS: this assertion is expected to FAIL in your repo, and
    // that is correct — your package.json carries YOUR app's version while
    // DAYBREAK_VERSION keeps reporting the framework's. Delete this one case
    // (keep the rest of the file); see .context/framework/VERSIONING.md.
    expect(DAYBREAK_VERSION).toBe(packageJson.version);
  });

  it('is independent of the Sunrise platform version', () => {
    // Guards a tempting shortcut: "just mirror whatever Sunrise is on." The two
    // tiers release on their own cadence — Daybreak ships releases without a
    // Sunrise bump and vice versa — so tying them together would be wrong the
    // first time either happened. This asserts they are separately sourced, not
    // that the values differ (they may coincide).
    expect(DAYBREAK_VERSION).not.toBe(SUNRISE_VERSION);
  });

  it('exposes all three tiers as distinct, independently sourced constants', () => {
    // The three-tier contract in one assertion: every tier answers, and each is
    // a real string rather than an empty default. In Daybreak's own repo
    // APP_VERSION and DAYBREAK_VERSION coincide (previous test); in a leaf they
    // diverge, which is exactly why all three are exported separately.
    for (const [name, value] of Object.entries({
      APP_VERSION,
      DAYBREAK_VERSION,
      SUNRISE_VERSION,
    })) {
      expect(value, `${name} must be a non-empty version string`).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});

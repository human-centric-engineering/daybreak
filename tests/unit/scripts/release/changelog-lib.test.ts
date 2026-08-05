/**
 * Tests: scripts/release/lib.ts — the changelog guard's decision logic.
 *
 * Table-driven over file lists, because the logic IS a function of the file list;
 * no git, no fs, no fixtures. The cases that matter are the two failure modes a
 * guard can have: firing when it shouldn't (which trains people to bypass it) and
 * staying silent when it should fire (which is the gap it exists to close).
 *
 * @see scripts/release/lib.ts · .context/framework/VERSIONING.md
 */

import { describe, it, expect } from 'vitest';
import { checkChangelog, formatVerdict, CHANGELOG_PATH } from '@/scripts/release/lib';

describe('checkChangelog', () => {
  describe('fires on a public-surface change with no entry', () => {
    it('flags a lib/app/* seam — the change that breaks a leaf', () => {
      // The 0.1.0 case exactly: data-export.ts changing hands. A leaf that filled
      // it needs to be told, and nothing else in CI would say so.
      const verdict = checkChangelog(['lib/app/data-export.ts']);

      expect(verdict.violation).toBe(true);
      expect(verdict.triggers).toHaveLength(1);
      expect(verdict.triggers[0]?.path).toBe('lib/app/data-export.ts');
      expect(verdict.triggers[0]?.reason).toContain('changing hands');
    });

    it('flags a framework_* schema change', () => {
      const verdict = checkChangelog(['prisma/schema/framework-facilitation.prisma']);
      expect(verdict.violation).toBe(true);
    });

    it('flags the version constant', () => {
      const verdict = checkChangelog(['lib/daybreak-version.ts']);
      expect(verdict.violation).toBe(true);
    });

    it('collects every trigger, not just the first', () => {
      // The message names all of them; a developer fixing one and re-running
      // should not discover the next one only on the following CI run.
      const verdict = checkChangelog([
        'lib/app/bootstrap.ts',
        'lib/daybreak-version.ts',
        'lib/framework/modules/service.ts',
      ]);

      expect(verdict.triggers.map((t) => t.path)).toEqual([
        'lib/app/bootstrap.ts',
        'lib/daybreak-version.ts',
      ]);
    });
  });

  describe('stays silent when it should', () => {
    it('passes when the changelog was updated alongside', () => {
      const verdict = checkChangelog(['lib/app/data-export.ts', CHANGELOG_PATH]);

      expect(verdict.violation).toBe(false);
      expect(verdict.changelogTouched).toBe(true);
      // Still reports the trigger — "required and satisfied" is distinct from
      // "not required", and the CLI prints the difference.
      expect(verdict.triggers).toHaveLength(1);
    });

    it('passes on framework internals — deliberately outside the gate', () => {
      // The documented public surface includes some of lib/framework/**, but a
      // path cannot tell a documented export from an internal refactor. Gating
      // it all would fire constantly and get the guard bypassed. See lib.ts.
      const verdict = checkChangelog([
        'lib/framework/modules/service.ts',
        'lib/framework/facilitation/map/queries.ts',
      ]);

      expect(verdict.violation).toBe(false);
      expect(verdict.triggers).toEqual([]);
    });

    it('passes on a docs-only change', () => {
      const verdict = checkChangelog([
        '.context/framework/README.md',
        '.context/framework/planning/plan.md',
      ]);
      expect(verdict.violation).toBe(false);
    });

    it('passes on a test-only change to a gated path', () => {
      // Adding a test for a seam does not change the seam.
      const verdict = checkChangelog(['tests/unit/lib/app/defaults.test.ts']);
      expect(verdict.violation).toBe(false);
    });

    it('does not ask a changelog-only PR to edit the changelog', () => {
      // `.context/` is exempt, and the changelog lives there — otherwise a PR
      // that ONLY fixes a changelog typo would trip its own guard.
      const verdict = checkChangelog([CHANGELOG_PATH]);
      expect(verdict.violation).toBe(false);
    });

    it('passes on an empty change list', () => {
      expect(checkChangelog([]).violation).toBe(false);
    });
  });

  describe('path matching is not over-broad', () => {
    it('does not treat a leaf’s nested lib/app code as a seam', () => {
      // `lib/app/programme/**` is a leaf's own product code (reclaim-your-week
      // has exactly this). Only top-level `lib/app/<name>.ts` files are seams.
      const verdict = checkChangelog(['lib/app/programme/service.ts']);
      expect(verdict.violation).toBe(false);
    });

    it('does not treat the leaf-reserved app.prisma as a framework schema', () => {
      const verdict = checkChangelog(['prisma/schema/app.prisma']);
      expect(verdict.violation).toBe(false);
    });

    it('does not treat a core Sunrise schema as a framework schema', () => {
      const verdict = checkChangelog(['prisma/schema/orchestration-agents.prisma']);
      expect(verdict.violation).toBe(false);
    });

    it('matches lib/app/eslint.config.mjs, which is a seam but not a .ts file', () => {
      const verdict = checkChangelog(['lib/app/eslint.config.mjs']);
      expect(verdict.violation).toBe(true);
    });
  });
});

describe('formatVerdict', () => {
  it('names the offending file AND why it is gated', () => {
    // A failure message that says only "add a changelog entry" makes the reader
    // guess what tripped it. Both halves are the actionable part.
    const message = formatVerdict(checkChangelog(['lib/app/data-export.ts']));

    expect(message).toContain('lib/app/data-export.ts');
    expect(message).toContain('changing hands');
    expect(message).toContain(CHANGELOG_PATH);
    expect(message).toContain('VERSIONING.md');
  });
});

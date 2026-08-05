/**
 * Coverage guard: lib/framework/privacy/export-sources.ts vs prisma/schema/framework-*.prisma
 *
 * The framework-tier counterpart of Sunrise's core guard
 * (`tests/unit/lib/privacy/export-sources.test.ts`), and it exists for exactly
 * the same reason: an export that omits a table looks exactly like a complete
 * answer to the person reading it. Nothing about the response reveals the gap —
 * not to the subject, not to the operator who sent it. Erasure has the
 * mirror-image rule (a missing `onDelete` throws `P2003` and breaks erasure
 * loudly); access has no natural loud failure, so this test is it.
 *
 * The core guard scans every `prisma/schema/*.prisma` and exempts models this
 * manifest declares. That exemption is what makes this file load-bearing: a
 * `framework_*` table is allowed out of the core manifest only for as long as it
 * is declared HERE. Between the two, every user-linked table in the repo is
 * forced into one manifest or the other.
 *
 * ---------------------------------------------------------------------------
 * IF THIS TEST IS FAILING
 * ---------------------------------------------------------------------------
 * You added a `framework_*` model holding a user id. Add it to
 * `FRAMEWORK_SUBJECT_DATA_SOURCES` with a disposition:
 *
 *   • `export`      — it holds the subject's own data (a `userId` column with
 *                     ON DELETE CASCADE). Return the rows in full.
 *   • `attribution` — it is framework config they authored (a `createdBy`
 *                     column with ON DELETE SET NULL). Return id + label + date.
 *
 * The disposition mirrors the erasure policy already in the migration — it is
 * not a fresh judgement.
 *
 * Deleting the row to make the test pass ships a short answer to a data
 * subject. Exclude it deliberately via `FRAMEWORK_EXCLUDED_SOURCES` instead.
 *
 * @see lib/framework/privacy/export-sources.ts · .context/privacy/data-export.md
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

// The manifest imports the Prisma client at module scope. Its delegates are
// only touched inside `fetch` closures, which this file never calls — the stub
// just keeps the import from standing up a real client.
vi.mock('@/lib/db/client', () => ({ prisma: {} }));

const { FRAMEWORK_SUBJECT_DATA_SOURCES, FRAMEWORK_EXCLUDED_SOURCES } =
  await import('@/lib/framework/privacy/export-sources');

const SCHEMA_DIR = path.join(process.cwd(), 'prisma', 'schema');

const MODEL_OPEN = /^model\s+(\w+)\s*\{/;

/**
 * A column holding a user id. The framework declares these as plain scalars with
 * a hand-written FK in the migration (no Prisma `@relation`), so the relation
 * scan the core guard runs would see none of them — the column name is the only
 * signal there is.
 */
const USER_SCALAR_FIELD =
  /^\s*(userId|createdBy|uploadedBy|ownerId|actorUserId|subjectUserId|reviewedBy)\s+String/;

interface SchemaScan {
  /** Framework models holding a user-id column. */
  userLinked: Set<string>;
  /** Every framework model name, for typo/rename detection. */
  allModels: Set<string>;
}

function scanFrameworkSchema(): SchemaScan {
  const userLinked = new Set<string>();
  const allModels = new Set<string>();

  const files = readdirSync(SCHEMA_DIR).filter(
    (file) => file.startsWith('framework-') && file.endsWith('.prisma')
  );

  for (const file of files) {
    const contents = readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
    let currentModel: string | null = null;

    for (const line of contents.split('\n')) {
      const open = MODEL_OPEN.exec(line);
      if (open?.[1]) {
        currentModel = open[1];
        allModels.add(currentModel);
        continue;
      }
      if (line.startsWith('}')) {
        currentModel = null;
        continue;
      }
      if (currentModel && USER_SCALAR_FIELD.test(line)) {
        userLinked.add(currentModel);
      }
    }
  }

  return { userLinked, allModels };
}

describe('framework subject-data source manifest', () => {
  const { userLinked, allModels } = scanFrameworkSchema();
  const declared = new Set(FRAMEWORK_SUBJECT_DATA_SOURCES.map((source) => source.model));

  describe('the scan itself', () => {
    // A regex that quietly stops matching would make every assertion below
    // vacuously true — the guard would pass while protecting nothing.
    it('finds the framework schema files', () => {
      expect(allModels.size).toBeGreaterThan(5);
    });

    it('recognises both column spellings', () => {
      // `userId` (Cascade, personal data) and `createdBy` (SetNull, retained).
      expect(userLinked.has('SlotValue')).toBe(true);
      expect(userLinked.has('FacilitationGraph')).toBe(true);
    });
  });

  describe('coverage', () => {
    it('declares every framework model holding a user id', () => {
      const missing = [...userLinked]
        .filter((model) => !declared.has(model))
        .filter((model) => !FRAMEWORK_EXCLUDED_SOURCES.some((source) => source.model === model))
        .sort();

      expect(
        missing,
        missing.length === 0
          ? ''
          : `These framework models hold a user id but are missing from ` +
              `FRAMEWORK_SUBJECT_DATA_SOURCES, so a data subject's export silently ` +
              `omits them: ${missing.join(', ')}. Add each with a disposition — ` +
              `'export' for the subject's own data (a userId/CASCADE column), ` +
              `'attribution' for framework config they authored (a createdBy/SET NULL ` +
              `column) — or to FRAMEWORK_EXCLUDED_SOURCES with a reason. ` +
              `See .context/privacy/data-export.md.`
      ).toEqual([]);
    });

    it('names only models that exist', () => {
      // Catches a rename or typo, which would otherwise leave a source in the
      // manifest that queries nothing and reports zero rows forever.
      const unknown = [
        ...FRAMEWORK_SUBJECT_DATA_SOURCES.map((source) => source.model),
        ...FRAMEWORK_EXCLUDED_SOURCES.map((source) => source.model),
      ]
        .filter((model) => !allModels.has(model))
        .sort();

      expect(unknown).toEqual([]);
    });
  });

  describe('manifest integrity', () => {
    it('lists each model once', () => {
      const models = FRAMEWORK_SUBJECT_DATA_SOURCES.map((source) => source.model);
      expect(models).toHaveLength(new Set(models).size);
    });

    it('gives each source its own section key', () => {
      // A collision would have one source overwrite another in the bundle —
      // silent data loss with a passing coverage check.
      const sections = FRAMEWORK_SUBJECT_DATA_SOURCES.map((source) => source.section);
      expect(sections).toHaveLength(new Set(sections).size);
    });

    it('does not collide with a core section key', () => {
      // The framework's sections land under `app.framework.*` rather than beside
      // core's, so a collision is not fatal today — but a shared name would make
      // the two tiers' output indistinguishable to a reader diffing bundles.
      const coreSections = new Set(['sessions', 'authProviders', 'conversations', 'agents']);
      const collisions = FRAMEWORK_SUBJECT_DATA_SOURCES.map((source) => source.section).filter(
        (section) => coreSections.has(section)
      );
      expect(collisions).toEqual([]);
    });

    it('gives every source a description', () => {
      // The description is what the subject reads to understand the boundary of
      // what they received; an empty one makes the meta block useless.
      for (const source of FRAMEWORK_SUBJECT_DATA_SOURCES) {
        expect(source.description.length, `${source.model} has no description`).toBeGreaterThan(10);
      }
    });

    it('gives every exclusion a reason', () => {
      for (const source of FRAMEWORK_EXCLUDED_SOURCES) {
        expect(source.reason.length, `${source.model} is excluded with no reason`).toBeGreaterThan(
          10
        );
      }
    });
  });

  describe('dispositions match the erasure policy', () => {
    // The two halves of GDPR must agree on what a row IS. A `userId` column with
    // ON DELETE CASCADE is personal data (it goes when the subject goes) → export.
    // A `createdBy` column with SET NULL is retained config → attribution.
    it('exports the CASCADE (userId) tables in full', () => {
      const personal = new Set(
        FRAMEWORK_SUBJECT_DATA_SOURCES.filter((s) => s.disposition === 'export').map((s) => s.model)
      );
      expect(personal).toEqual(
        new Set(['UserJourney', 'JourneyEvent', 'SlotValue', 'FrameworkJourneyNudge'])
      );
    });

    it('reduces the SET NULL (createdBy) tables to attribution', () => {
      const authored = new Set(
        FRAMEWORK_SUBJECT_DATA_SOURCES.filter((s) => s.disposition === 'attribution').map(
          (s) => s.model
        )
      );
      expect(authored).toEqual(
        new Set([
          'FacilitationGraph',
          'FacilitationGraphVersion',
          'FacilitationPolicy',
          'StructureChangeProposal',
          'ModuleVersion',
          'ModuleWorkflowBinding',
        ])
      );
    });
  });
});

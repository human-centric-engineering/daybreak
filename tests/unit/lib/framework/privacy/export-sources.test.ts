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
 * ---------------------------------------------------------------------------
 * WHAT MOVED TO CORE — and what did not (Sunrise 0.10.0, #533)
 * ---------------------------------------------------------------------------
 * The COVERAGE half is no longer here. Daybreak carried it fork-first while
 * Sunrise #533 was open; 0.10.0 landed the resolver, and core's guard
 * (`tests/unit/lib/privacy/export-sources.test.ts`) now holds every
 * `framework-*.prisma` model to FULL accounting against what
 * `initFrameworkSubjectSources()` registers — declared as a source or excluded
 * with a reason, no third state. That is strictly stronger than the
 * `userId`/`createdBy` heuristic this file used to apply, which could not see a
 * table reached by JOIN: `FrameworkConversationEval` was invisible to it for
 * exactly as long as it was what we relied on. Carrying a weaker duplicate
 * alongside it is the shim we said we would delete when the ask landed.
 *
 * What core cannot do — and what this file therefore still holds:
 *
 *   • **Disposition ↔ erasure parity.** Core reads its own column vocabulary,
 *     not the framework's migrations. Nothing upstream can check that a CASCADE
 *     `userId` table exports in full while a SET NULL `createdBy` table reduces
 *     to attribution.
 *   • **Manifest integrity.** Core's registry refuses a duplicate model or a
 *     colliding section by REJECTING the row, which then fails core's guard as
 *     "unaccounted" — a true failure with a misleading cause. Catching it here
 *     names what actually went wrong.
 *
 * ---------------------------------------------------------------------------
 * IF THIS TEST IS FAILING
 * ---------------------------------------------------------------------------
 * You added a `framework_*` model. Add it to `FRAMEWORK_SUBJECT_DATA_SOURCES`
 * with a disposition:
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

  // The `coverage` block that stood here is gone — delegated to core's guard,
  // which holds every framework model to full accounting rather than to a
  // user-id heuristic. See the header. `tests/unit/lib/framework/privacy/export.test.ts`
  // pins the other half of that delegation: that the bridge actually registers.

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
      // Sections are FLAT under `app` since the 0.11.1 sync — the nested
      // `app.framework` wrapper is gone — so a name shared with a core section
      // puts two tiers' rows under keys a reader cannot tell apart. `app` and
      // `personalData` are still separate objects in the bundle, so this is a
      // legibility guard rather than an overwrite guard; the overwrite case
      // (two FRAMEWORK sources sharing a section) is the test above.
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
        new Set([
          'UserJourney',
          'JourneyEvent',
          'SlotValue',
          'FrameworkJourneyNudge',
          // Reached by JOIN through `conversationId`, not by a user column — so
          // the CASCADE/SET NULL rule above does not classify it and the userId
          // scan never saw it. It is still the subject's data (assessments OF
          // their turns), and it is here because full accounting forced the
          // question the heuristic could not ask.
          'FrameworkConversationEval',
        ])
      );
    });

    it('classifies every declared source by one of the two rules, or names why not', () => {
      // The set above is a literal, so a new source added without thinking about
      // its erasure policy would simply fail it with a diff. This says what the
      // diff MEANS: every export source is either a CASCADE user column or a
      // deliberate join-reached exception, and there is no third way in.
      const joinReached = new Set(['FrameworkConversationEval']);
      const unclassified = FRAMEWORK_SUBJECT_DATA_SOURCES.filter(
        (source) =>
          source.disposition === 'export' &&
          !userLinked.has(source.model) &&
          !joinReached.has(source.model)
      ).map((source) => source.model);

      expect(
        unclassified,
        unclassified.length === 0
          ? ''
          : `These sources export in full but hold no user column: ` +
              `${unclassified.join(', ')}. Either they reach the subject by a join ` +
              `(add them to joinReached here, with the join spelled out in the ` +
              `manifest) or the disposition is wrong.`
      ).toEqual([]);
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

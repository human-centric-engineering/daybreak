/**
 * Framework subject-data manifest (GDPR Art. 15) — the framework tier's half of
 * the subject-access export.
 *
 * Sunrise's `lib/privacy/export-sources.ts` covers the PLATFORM's tables and
 * cannot see Daybreak's; `lib/app/data-export.ts` is the seam it exposes for
 * everything it cannot see. Daybreak fills that seam as a bridge (its third,
 * after `bootstrap.ts` and `admin-nav.ts`), and this file is what the bridge
 * collects — every `framework_*` table holding data about a person, with an
 * explicit disposition:
 *
 * - `export`      — the subject's own data, returned in full.
 * - `attribution` — framework config the subject authored: id + label + date.
 *   The config belongs to the organisation; the fact of authorship belongs to
 *   the subject. This is the same reasoning erasure uses when it retains the
 *   row and nulls the link.
 *
 * **The disposition is not a fresh judgement — it mirrors the erasure policy
 * already written into each migration.** A `userId` column with a hand-written
 * `ON DELETE CASCADE` is personal data (it goes when the subject goes), so it
 * exports in full. A `createdBy` column with `ON DELETE SET NULL` is retained
 * config, so it exports as attribution. Keeping the two halves of GDPR agreeing
 * on what a row *is* is the point; if you change one, change the other.
 *
 * **Adding a framework table?** Add it here too. The guard at
 * `tests/unit/lib/framework/privacy/export-sources.test.ts` parses
 * `prisma/schema/framework-*.prisma` and fails until you do — the framework-tier
 * counterpart of the core guard, and for the same reason: erasure fails loudly
 * (a missing `onDelete` throws `P2003`), while an export that omits a table
 * looks exactly like a complete answer to the person reading it.
 *
 * **Never delete a row here to make that test pass.** That ships a silently
 * short answer to a data subject. Exclude it deliberately, with a reason, via
 * `FRAMEWORK_EXCLUDED_SOURCES`.
 *
 * @see lib/privacy/export-sources.ts · lib/app/data-export.ts
 * @see .context/privacy/data-export.md · .context/framework/README.md
 */

import { prisma } from '@/lib/db/client';
import type {
  AttributionRow,
  ExcludedSource,
  SubjectDataSource,
  SubjectQuery,
} from '@/lib/privacy/export-sources';

const byCreatedAt = { createdAt: 'asc' } as const;

/**
 * Every `framework_*` model carrying a user id, with its disposition. Ordered
 * personal-data first, then attribution — matching how the core manifest
 * presents its own.
 */
export const FRAMEWORK_SUBJECT_DATA_SOURCES: SubjectDataSource[] = [
  // ---------------------------------------------------------------------
  // Personal data — the subject's own records. Every one of these is a
  // `userId` column with a hand-written ON DELETE CASCADE.
  // ---------------------------------------------------------------------
  {
    model: 'UserJourney',
    section: 'journeys',
    disposition: 'export',
    description:
      'Facilitation maps the subject has walked, including their per-node progress states.',
    // `nodeStates` is nested rather than being a source of its own: `UserNodeState`
    // holds no user id (it reaches the subject only through this journey), so the
    // coverage guard cannot see it and it has no way to be exported except here.
    // `events` and `nudges` are NOT nested — they are sources in their own right
    // below, and nesting them too would hand the subject the same rows twice.
    fetch: ({ userId }) =>
      prisma.userJourney.findMany({
        where: { userId },
        include: { nodeStates: true },
        orderBy: { startedAt: 'asc' },
      }),
  },
  {
    model: 'JourneyEvent',
    section: 'journeyEvents',
    disposition: 'export',
    description:
      'Every recorded interaction with the framework — steps taken through a map, and engagement events such as feedback the subject left.',
    // Deliberately matched on `userId` alone, NOT on `journeyId`: an event with a
    // null `journeyId` is a non-journey engagement event (a `module.feedback` row
    // carries the subject's free-text comment), reachable only by this column. A
    // journey-scoped query would silently drop exactly the rows holding the
    // subject's own words.
    fetch: ({ userId }) =>
      prisma.journeyEvent.findMany({ where: { userId }, orderBy: { occurredAt: 'asc' } }),
  },
  {
    model: 'SlotValue',
    section: 'slotValues',
    disposition: 'export',
    description:
      'Facts the framework has captured about the subject from their conversations, including superseded earlier readings and the reasoning recorded for each.',
    // Superseded versions are included on purpose: they are prior statements
    // held about the subject, and Art. 15 covers what is held, not only what is
    // current. `provenance` and `reasoningNote` are how the subject can see WHY
    // a reading was made, so neither is omitted.
    fetch: ({ userId }) =>
      prisma.slotValue.findMany({ where: { userId }, orderBy: { capturedAt: 'asc' } }),
  },
  {
    model: 'FrameworkJourneyNudge',
    section: 'journeyNudges',
    disposition: 'export',
    description:
      'Throttle records of when the framework last nudged the subject toward a next step.',
    fetch: ({ userId }) =>
      prisma.frameworkJourneyNudge.findMany({ where: { userId }, orderBy: { nudgedAt: 'asc' } }),
  },

  // ---------------------------------------------------------------------
  // Attribution — framework config the subject authored. Identity of the
  // thing, never its contents. Every one is a `createdBy` column with a
  // hand-written ON DELETE SET NULL.
  // ---------------------------------------------------------------------
  {
    model: 'FacilitationGraph',
    section: 'facilitationMaps',
    disposition: 'attribution',
    description: 'Facilitation maps the subject created.',
    fetch: async ({ userId }: SubjectQuery): Promise<AttributionRow[]> => {
      const rows = await prisma.facilitationGraph.findMany({
        where: { createdBy: userId },
        select: { id: true, name: true, createdAt: true },
        orderBy: byCreatedAt,
      });
      return rows.map((row) => ({ id: row.id, label: row.name, createdAt: row.createdAt }));
    },
  },
  {
    model: 'FacilitationGraphVersion',
    section: 'facilitationMapVersions',
    disposition: 'attribution',
    description: 'Facilitation map versions the subject published.',
    // `createdBy` also admits `agent:<slug>` for agent-authored versions; a user
    // id never collides with that prefix, so matching on it needs no filter.
    fetch: async ({ userId }: SubjectQuery): Promise<AttributionRow[]> => {
      const rows = await prisma.facilitationGraphVersion.findMany({
        where: { createdBy: userId },
        select: { id: true, version: true, createdAt: true, graph: { select: { slug: true } } },
        orderBy: byCreatedAt,
      });
      return rows.map((row) => ({
        id: row.id,
        label: `${row.graph.slug} v${row.version}`,
        createdAt: row.createdAt,
      }));
    },
  },
  {
    model: 'FacilitationPolicy',
    section: 'facilitationPolicies',
    disposition: 'attribution',
    description: 'Governance policies the subject created.',
    fetch: async ({ userId }: SubjectQuery): Promise<AttributionRow[]> => {
      const rows = await prisma.facilitationPolicy.findMany({
        where: { createdBy: userId },
        select: { id: true, kind: true, createdAt: true },
        orderBy: byCreatedAt,
      });
      return rows.map((row) => ({ id: row.id, label: row.kind, createdAt: row.createdAt }));
    },
  },
  {
    model: 'StructureChangeProposal',
    section: 'structureChangeProposals',
    disposition: 'attribution',
    description: 'Structure-change proposals the subject raised or reviewed.',
    // Matched on BOTH author columns. `reviewedBy` is a second SET NULL FK to
    // `user` that the coverage scan does not flag separately (the model is
    // already declared via `createdBy`), so a `createdBy`-only query would drop
    // every proposal the subject approved or rejected — authorship the subject
    // is equally entitled to see. `createdBy` also admits `agent:<slug>`.
    fetch: async ({ userId }: SubjectQuery): Promise<AttributionRow[]> => {
      const rows = await prisma.structureChangeProposal.findMany({
        where: { OR: [{ createdBy: userId }, { reviewedBy: userId }] },
        select: { id: true, subjectType: true, status: true, createdAt: true },
        orderBy: byCreatedAt,
      });
      return rows.map((row) => ({
        id: row.id,
        label: `${row.subjectType} (${row.status})`,
        createdAt: row.createdAt,
      }));
    },
  },
  {
    model: 'ModuleVersion',
    section: 'moduleVersions',
    disposition: 'attribution',
    description: 'Module configuration versions the subject published.',
    fetch: async ({ userId }: SubjectQuery): Promise<AttributionRow[]> => {
      const rows = await prisma.moduleVersion.findMany({
        where: { createdBy: userId },
        select: { id: true, version: true, createdAt: true, module: { select: { slug: true } } },
        orderBy: byCreatedAt,
      });
      return rows.map((row) => ({
        id: row.id,
        label: `${row.module.slug} v${row.version}`,
        createdAt: row.createdAt,
      }));
    },
  },
  {
    model: 'ModuleWorkflowBinding',
    section: 'moduleWorkflowBindings',
    disposition: 'attribution',
    description: 'Module-to-workflow bindings the subject created.',
    fetch: async ({ userId }: SubjectQuery): Promise<AttributionRow[]> => {
      const rows = await prisma.moduleWorkflowBinding.findMany({
        where: { createdBy: userId },
        select: { id: true, eventType: true, createdAt: true, module: { select: { slug: true } } },
        orderBy: byCreatedAt,
      });
      return rows.map((row) => ({
        id: row.id,
        label: `${row.module.slug} → ${row.eventType}`,
        createdAt: row.createdAt,
      }));
    },
  },
];

/**
 * Framework models deliberately left out of the export, with the reason the
 * subject is shown. Empty today — every `framework_*` table carrying a user id
 * is exported above. Kept (rather than omitted) so excluding one is a decision
 * with a written reason, not a silent deletion from the manifest.
 */
export const FRAMEWORK_EXCLUDED_SOURCES: ExcludedSource[] = [];

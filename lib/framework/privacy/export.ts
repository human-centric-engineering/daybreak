/**
 * Framework subject-data collector (GDPR Art. 15).
 *
 * Runs `FRAMEWORK_SUBJECT_DATA_SOURCES` and assembles the framework tier's
 * contribution to a subject export, in the same shape core uses for its own
 * tables: personal data in full, authored config as attribution, and a `meta`
 * block echoing every source with its row count so the subject can see the
 * BOUNDARY of what they received rather than infer it.
 *
 * Called by the `lib/app/data-export.ts` bridge, which folds the result into the
 * bundle's `app.framework` section.
 *
 * **Nothing here is best-effort.** A source that throws fails the whole export —
 * deliberately the opposite of the erasure path, where hook failures are
 * swallowed so app trouble can never block a deletion. An export that quietly
 * lost a section is indistinguishable, to the person reading it, from one that
 * had nothing to show.
 *
 * @see lib/framework/privacy/export-sources.ts · lib/privacy/export-user.ts
 */

import {
  FRAMEWORK_EXCLUDED_SOURCES,
  FRAMEWORK_SUBJECT_DATA_SOURCES,
} from '@/lib/framework/privacy/export-sources';
import type { ExcludedSource, SubjectQuery } from '@/lib/privacy/export-sources';
// MUST stay `import type`. There is a cycle here that is only harmless because
// this edge is erased at compile time:
//
//   export-user.ts → lib/app/data-export.ts → THIS FILE → export-user.ts
//
// The first two edges are real value imports (core calls the bridge, the bridge
// calls this collector). Turning this one into a value import closes the loop at
// runtime, and the module that breaks is the subject-access export — a GDPR path
// that fails in production, not in a unit test where the collector is mocked.
// If you need a runtime symbol from `export-user`, move it to `export-sources`
// (which is a leaf of this graph) rather than importing it here.
import type { ExportedSourceSummary } from '@/lib/privacy/export-user';

/** The framework tier's contribution to a subject export. */
export interface FrameworkSubjectExport {
  meta: {
    /** Framework sources returned in full, with row counts. */
    exported: ExportedSourceSummary[];
    /** Framework sources returned as id + label + date only, with row counts. */
    attribution: ExportedSourceSummary[];
    /** Framework tables deliberately left out, with the reason. */
    excluded: ExcludedSource[];
  };
  /** The subject's own framework data, keyed by section. */
  personalData: Record<string, unknown[]>;
  /** Framework config the subject authored — identity of each thing, not its contents. */
  attributions: Record<string, unknown[]>;
}

/** Collect the framework tier's data about one subject. */
export async function collectFrameworkSubjectData(
  subject: SubjectQuery
): Promise<FrameworkSubjectExport> {
  const results = await Promise.all(
    FRAMEWORK_SUBJECT_DATA_SOURCES.map(async (source) => ({
      source,
      rows: await source.fetch(subject),
    }))
  );

  const personalData: Record<string, unknown[]> = {};
  const attributions: Record<string, unknown[]> = {};
  const exported: ExportedSourceSummary[] = [];
  const attribution: ExportedSourceSummary[] = [];

  for (const { source, rows } of results) {
    const summary: ExportedSourceSummary = {
      model: source.model,
      section: source.section,
      description: source.description,
      // Only present on narrowed sources — a row count with no note means the
      // subject received every row that matched them.
      ...(source.scopeNote ? { scopeNote: source.scopeNote } : {}),
      rows: rows.length,
    };

    if (source.disposition === 'export') {
      personalData[source.section] = rows;
      exported.push(summary);
    } else {
      attributions[source.section] = rows;
      attribution.push(summary);
    }
  }

  return {
    meta: { exported, attribution, excluded: FRAMEWORK_EXCLUDED_SOURCES },
    personalData,
    attributions,
  };
}

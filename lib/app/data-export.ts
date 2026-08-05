/**
 * App subject-data export seam (GDPR Art. 15) — Daybreak's framework/leaf bridge.
 *
 * **Fork-owned scaffold.** Upstream Sunrise ships this returning nothing and does
 * NOT change it after release, so Daybreak's edits here merge cleanly on upgrade
 * (the stable contract is this file's `collectAppSubjectData` export, not its
 * body).
 *
 * Auto-wired: `exportUserData()` (`lib/privacy/export-user.ts`) calls this and
 * folds the result into the `app` section of the export bundle, so both the
 * self-service and admin export endpoints pick it up with no core edit.
 *
 * Daybreak fills it to contribute the **framework** tier's tables, then delegates
 * to the reserved **leaf** seam — the subject-access analogue of the boot bridge
 * (`bootstrap.ts` → `initFramework()` → `leaf-bootstrap.ts`) and the nav bridge
 * (`admin-nav.ts` → `initFrameworkNav()` → `leaf-admin-nav.ts`). This is the
 * THIRD `lib/app/*` file Daybreak fills; `lib/app/**` is the sanctioned
 * core→framework bridge (the ESLint boundary exempts it).
 *
 * Core covers its own tables via `lib/privacy/export-sources.ts` and cannot see
 * the framework's; the framework's own manifest lives at
 * `lib/framework/privacy/export-sources.ts`, guarded by its own coverage test.
 *
 * NOTE — `@/lib/framework/privacy/export` is imported STATICALLY, matching
 * `admin-nav.ts` rather than `bootstrap.ts`. The static specifier is safe because
 * this filled bridge lives only in Daybreak: vanilla Sunrise ships the empty
 * version with no framework import, and every Daybreak leaf fork has the
 * `lib/framework/` folder, so it always resolves. (`bootstrap.ts` reaches for a
 * dynamic import because it runs at server boot in every runtime; this seam runs
 * only inside the two export route handlers.)
 *
 * **Failures are NOT swallowed here.** A collector that throws fails the whole
 * export — the deliberate opposite of the erasure path, where hook failures are
 * swallowed so app trouble can never block a deletion. An export that quietly
 * lost a section looks exactly like a complete answer to the person reading it.
 *
 * Full guide: .context/privacy/data-export.md · CUSTOMIZATION.md §4
 */

import { collectFrameworkSubjectData } from '@/lib/framework/privacy/export';
import { collectLeafSubjectData } from '@/lib/app/leaf-data-export';

/** Identity of the subject being exported. */
export interface AppSubjectQuery {
  /** Id of the data subject. */
  userId: string;
  /** The subject's email — for app tables keyed by address rather than user id. */
  email: string;
}

/**
 * App-owned subject data, keyed by section name. Each section lands under
 * `app.<section>` in the export bundle. Values must be JSON-serialisable.
 */
export type AppSubjectData = Record<string, unknown>;

/**
 * Collect Daybreak's data about one subject: the framework tier under the
 * reserved `framework` section, plus whatever the leaf app contributes.
 */
export async function collectAppSubjectData(subject: AppSubjectQuery): Promise<AppSubjectData> {
  const [framework, leaf] = await Promise.all([
    collectFrameworkSubjectData(subject),
    collectLeafSubjectData(subject),
  ]);

  // Leaf sections spread first so that `framework` cannot be shadowed by a leaf
  // returning that key — the framework's contribution is the one section a leaf
  // must not be able to overwrite (documented as reserved in leaf-data-export.ts).
  return { ...leaf, framework };
}

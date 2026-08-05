/**
 * Leaf-app subject-data export seam (GDPR Art. 15) — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) fills `collectLeafSubjectData()` with its own
 * `app_*` tables holding data about a person. Daybreak keeps it empty: this is
 * the leaf's export seam, reserved so a leaf's collectors merge cleanly on
 * upgrade — the subject-access analogue of `lib/app/leaf-bootstrap.ts`,
 * `lib/app/leaf-admin-nav.ts` and `lib/app/leaf-db-drift.ts`.
 *
 * Called by `lib/app/data-export.ts`'s `collectAppSubjectData()` alongside the
 * framework tier's own collector. Whatever you return lands under `app.<section>`
 * in the export bundle.
 *
 * ```ts
 * export async function collectLeafSubjectData({ userId }: AppSubjectQuery): Promise<AppSubjectData> {
 *   const bookings = await prisma.appBooking.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
 *   return { bookings };
 * }
 * ```
 *
 * **`framework` is a reserved section name** — the bridge puts the framework
 * tier's contribution there, and a leaf returning that key would overwrite it.
 *
 * **Keep it complete.** Sunrise's core guard (`export-sources.test.ts`) and
 * Daybreak's framework guard (`lib/framework/privacy/export-sources.test.ts`)
 * each diff their own schema files against their own manifest; neither can see
 * your `app_*` tables. The pattern worth copying is a constant listing the
 * tables you export plus a test that greps `prisma/schema/app.prisma` for
 * `@@map("app_…")` and asserts each mapped table appears in it. Then adding a
 * table without extending the export fails your build instead of shipping a
 * short answer to a data subject.
 *
 * A table holding no personal data is fine to leave out — but say so in a
 * comment where you list them, so the omission reads as a decision rather than
 * an oversight.
 *
 * @see lib/app/data-export.ts · .context/privacy/data-export.md · CUSTOMIZATION.md §4
 */

import type { AppSubjectData, AppSubjectQuery } from '@/lib/app/data-export';

/**
 * Collect this leaf app's data about one subject. Ships empty — Daybreak has no
 * leaf tables, so a vanilla Daybreak export contributes nothing here.
 */
/*
 * `async` is the seam's contract, not an implementation detail: every real
 * collector awaits its queries, and the empty default must not force a leaf to
 * change the signature just to add one.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function collectLeafSubjectData(_subject: AppSubjectQuery): Promise<AppSubjectData> {
  return {};
}

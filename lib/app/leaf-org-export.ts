/**
 * Leaf-app org-export sources — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) declares here the models of its own that carry `orgId`, so an
 * organisation's data export includes them (Sunrise §109; guide: `.context/privacy/org-export.md`,
 * "Fork tables"). Daybreak keeps this empty: it is the leaf's seam, reserved so a leaf's
 * declarations merge cleanly on upgrade — the org-export analogue of `lib/app/leaf-data-export.ts`.
 *
 * Called by `lib/app/org-export.ts`'s `initAppOrgSources()` AFTER the framework tier registers its
 * own (`lib/framework/privacy/org-sources.ts`, 18 sources and one exclusion — worked examples of
 * the shape). `tests/unit/lib/privacy/org-sources.test.ts` scans every schema file, yours included,
 * and fails naming any `orgId` model no tier declares: declare each as a source, or as an exclusion
 * with the reason the reader is shown.
 *
 * ```ts
 * import { prisma } from '@/lib/db/client';
 * import { ownedBy } from '@/lib/privacy/org-sources';
 * import { registerAppOrgSources } from '@/lib/privacy/org-source-registry';
 *
 * export function initLeafOrgSources(): void {
 *   registerAppOrgSources({
 *     tier: 'app',
 *     sources: [
 *       {
 *         model: 'AppContract',
 *         section: 'contracts',
 *         disposition: 'export',
 *         description: 'Contracts the organisation holds with its clients.',
 *         fetch: ({ orgId }) =>
 *           prisma.appContract.findMany({ where: ownedBy(orgId), orderBy: { createdAt: 'asc' } }),
 *       },
 *     ],
 *   });
 * }
 * ```
 *
 * **A throwing init takes the framework's declarations down with yours.** Core runs this and the
 * framework's registration as one unit and rolls the whole unit back on a throw (logged at error),
 * after which `exportOrgData()` refuses every org until it is fixed. A row the registry rejects —
 * a short description, a section or model another tier already declared — is dropped and logged
 * instead, and the export refuses only if that leaves a model undeclared.
 *
 * Register synchronously: this function must not be `async`.
 *
 * @see lib/app/org-export.ts · lib/privacy/org-source-registry.ts · CUSTOMIZATION.md §4
 */
export function initLeafOrgSources(): void {
  // No leaf org sources by default.
}

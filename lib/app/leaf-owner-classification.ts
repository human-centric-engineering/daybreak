/**
 * Leaf-app owner classification — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) classifies its own user-linked models here: `personal` for a row
 * private to one person, `not-personal` (with the reason) for one that records who did something
 * (Sunrise §115; guide: `.context/auth/authorization.md`, "Owner classification"). Daybreak keeps
 * this empty: it is the leaf's seam, reserved so a leaf's classifications merge cleanly on upgrade.
 *
 * Called by `lib/app/owner-classification.ts`'s `initAppOwnerClassification()` AFTER the framework
 * tier registers its own (`lib/framework/privacy/owner-classification.ts`). A model the framework
 * already classifies is dropped with a log; the framework's row stands.
 * `tests/unit/lib/db/owner-classification.test.ts` fails naming any model in your schema file that
 * links to a user, or to a personal model, and no tier classified.
 *
 * ```ts
 * import { registerAppOwnerClassification } from '@/lib/db/owner-classification';
 *
 * export function initLeafOwnerClassification(): void {
 *   registerAppOwnerClassification({
 *     tier: 'app',
 *     models: {
 *       AppJournalEntry: { kind: 'personal', owner: { column: 'userId' }, enforced: true },
 *       AppInvoice: { kind: 'not-personal', because: 'Org billing record; userId is who raised it.' },
 *     },
 *   });
 * }
 * ```
 *
 * Classify every user-linked model whether or not the guard names it: it sees a `userId` /
 * `createdBy` column and a `String` named `…UserId`; mark a user id named any other way with a
 * `/// owner-classification: user-id` doc line above the field.
 *
 * Synchronous, and no Prisma import: this runs while the Prisma client is being built.
 *
 * @see lib/app/owner-classification.ts · lib/db/owner-classification.ts · CUSTOMIZATION.md §4
 */
export function initLeafOwnerClassification(): void {
  // No leaf owner classifications by default.
}

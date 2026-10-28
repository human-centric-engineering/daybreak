/**
 * Leaf-app erasure cleanup hooks and stale writers — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) registers here what Sunrise's `lib/app/erasure.ts` scaffold is
 * for: cleanup for the leaf's own data that the FK cascade cannot reach (object-storage blobs,
 * search documents, PII on rows an `ON DELETE SET NULL` table keeps), and, for each leaf file that
 * writes a column core erasure scrubs in place, a stale-writer declaration saying how it knows its
 * copy is stale. Daybreak keeps this empty: it is the leaf's seam, reserved so a leaf's
 * registrations merge cleanly on upgrade — the erasure analogue of `lib/app/leaf-data-export.ts`.
 *
 * Called by `lib/app/erasure.ts`'s `initAppErasureHooks()` AFTER the framework tier registers its
 * own (`lib/framework/privacy/erasure.ts` — a worked example of both):
 *
 * ```ts
 * import { registerErasureCleanupHook, registerStaleWriter } from '@/lib/privacy/erasure-hooks';
 *
 * export function initLeafErasureHooks(): void {
 *   registerErasureCleanupHook({
 *     name: 'leaf:avatars',
 *     cleanupExternal: async ({ userId }) => deleteAvatarBlobs(userId),
 *   });
 *   registerStaleWriter({
 *     file: 'lib/app/orders/notify-settings.ts',
 *     model: 'AiWebhookSubscription',
 *     anchor: 'version',
 *     how: 'Saves with the version it loaded; refused once the subscription moved.',
 *   });
 * }
 * ```
 *
 * **Name a hook so it cannot collide with the framework's.** Both registries are keyed — a hook by
 * `name`, a writer by `file` and `model` — so re-registering a key replaces it. Prefix yours
 * (`leaf:`); the framework's start `framework:`.
 *
 * **A throwing init takes the framework's registrations down with yours.** Core runs this and the
 * framework's registration as one unit and rolls the whole unit back on a throw, after which no
 * fork cleanup runs inside an erasure until it is fixed.
 *
 * Register synchronously: this function must not be `async`.
 *
 * @see lib/app/erasure.ts · lib/privacy/erasure-hooks.ts · .context/privacy/data-erasure.md
 */
export function initLeafErasureHooks(): void {
  // No leaf erasure hooks by default.
}

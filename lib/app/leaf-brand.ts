/**
 * Leaf-app brand identity — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) sets its product name, legal entity and root
 * meta description here. Daybreak keeps every value `null`: this is the leaf's
 * brand seam, reserved so a leaf's identity merges cleanly on upgrade.
 *
 * Read by `lib/app/brand.ts`, the bridge Daybreak fills. A non-`null` value here
 * wins over Daybreak's; `null` falls through to Daybreak's own identity, and
 * `lib/brand.ts` falls through again to Sunrise's.
 *
 * **Override, not append — and that is why this file exists.** Brand identity is
 * single-valued: a leaf does not compose with the framework's name, it replaces
 * it. Sunrise's `lib/app/brand.ts` is a leaf scaffold, so Daybreak filling it
 * would leave a leaf resolving a merge conflict against Daybreak's own strings
 * on every upgrade. Splitting the seam in two gives the leaf an empty file to
 * fill, exactly as `leaf-bootstrap.ts` / `leaf-admin-nav.ts` / `leaf-data-export.ts`
 * do for the other three bridges.
 *
 * Boundary-clean: no imports, so this stays inside the framework-agnostic
 * `lib/app/**` boundary.
 *
 * @see lib/app/brand.ts · lib/brand.ts · CUSTOMIZATION.md §2
 */

/** Product name — page titles, header/footer brand, emails. `null` → Daybreak's. */
export const leafBrandName: string | null = null;

/** Copyright holder, where it differs from the product. `null` → Daybreak's. */
export const leafBrandLegalName: string | null = null;

/** Root `<meta name="description">` fallback. `null` → Daybreak's. */
export const leafBrandDescription: string | null = null;

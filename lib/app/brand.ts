/**
 * App brand identity — the fork-owned bridge carrying Daybreak's own identity,
 * with the leaf's taking precedence over it.
 *
 * **Fork-owned scaffold.** Upstream Sunrise ships all three values `null` (=
 * "Sunrise") and does not change this file after release, so Daybreak's edits
 * here merge cleanly on upgrade (the stable contract is this file's three
 * exports, not their values).
 *
 * Read by `lib/brand.ts`, which every brand-bearing surface already imports:
 * layout metadata, the header `<BrandMark>`, both footers, the email templates.
 *
 * This is the FOURTH `lib/app/*` file Daybreak fills, after `bootstrap.ts`,
 * `admin-nav.ts` and `data-export.ts` — and like all three it delegates to a
 * reserved-empty leaf seam (`lib/app/leaf-brand.ts`) rather than occupying the
 * scaffold outright, so a leaf fork of Daybreak still has an empty file of its
 * own to fill. The difference from the other bridges is the composition rule:
 * brand identity is single-valued, so the leaf **overrides** rather than
 * appends. `??` and not `||`, so a leaf can deliberately set an empty string.
 *
 * Why code rather than `NEXT_PUBLIC_*`: those are inlined at **build time** and
 * no container build delivered them, so a fork with its brand correctly
 * configured still shipped as "Sunrise" (Sunrise #661). Daybreak carried exactly
 * that defect — `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_LEGAL_NAME` were set in
 * `.env.local` and reached no container build — until the v0.11.0 sync.
 *
 * Full guide: CUSTOMIZATION.md §2 · .context/framework/README.md
 */

import { leafBrandName, leafBrandLegalName, leafBrandDescription } from '@/lib/app/leaf-brand';

/** Product name — page titles, header/footer brand, emails. */
export const appBrandName: string | null = leafBrandName ?? 'Daybreak';

/**
 * Copyright holder, which differs from the product here: the product is
 * "Daybreak", the legal entity behind it is All Too Human Ltd.
 */
export const appBrandLegalName: string | null = leafBrandLegalName ?? 'All Too Human Ltd';

/**
 * Root `<meta name="description">`, for any page that sets none of its own —
 * in practice `app/not-found.tsx` and the root error pages, which is precisely
 * where nobody thinks to look. Deliberately short: a wrong sentence is worse
 * than a plain one (Sunrise #519).
 */
export const appBrandDescription: string | null =
  leafBrandDescription ?? 'Daybreak — an AI-application framework built on the Sunrise platform.';

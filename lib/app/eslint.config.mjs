// Leaf-app ESLint seam — RESERVED, empty by default.
//
// This is the extension point a leaf app (a fork of Daybreak) uses to add its
// OWN ESLint blocks — its own import boundaries, rule overrides, etc. — without
// editing the root `eslint.config.mjs`. The root spreads this array after
// Sunrise's blocks and Daybreak's framework blocks, so a leaf block can override
// a rule for its own paths (last-match wins in flat config).
//
// Daybreak keeps it empty (Daybreak is the framework tier; its own blocks live
// in `lib/framework/eslint.config.mjs`). A leaf fork fills this array. This is
// the ESLint counterpart of the reserved `lib/app/*` scaffolds and the
// `initApp()` boot seam — and the fork-first shape of Sunrise issue #382.
//
// Contract for a leaf filling this: `no-restricted-imports` REPLACES (does not
// merge), so a block here restates any base rule (e.g. the `@/`-alias ban) it
// needs to keep for its own file globs.

export default [];

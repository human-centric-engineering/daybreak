// Framework-tier ESLint blocks (Daybreak-owned).
//
// This is the framework layer's slice of the flat config, kept OUT of the root
// `eslint.config.mjs` so the root stays Sunrise's file with a minimal, generic
// diff (it just spreads this array). That is the fork-first shape of Sunrise
// issue #382 (ESLint config seam): when upstream adopts the seam, the root
// change merges cleanly and these blocks stay entirely fork-owned — no more
// growing edits inside a platform-owned file.
//
// Exported as a plain flat-config array; the root spreads it AFTER Sunrise's own
// blocks (order matters — a fork block must be able to override a core rule for
// its own paths). See `.context/framework/README.md` and f-bootstrap t-2.
//
// FLAT-CONFIG FOOTGUN: `no-restricted-imports` REPLACES (does not merge) across
// matching blocks. Every block below therefore RESTATES the `@/`-alias ban
// (`aliasBan`) alongside its own rule — omit it and relative-import enforcement
// silently drops for those paths.

/** The repo-wide `@/`-alias ban, restated in each block (see footgun above). */
const aliasBan = {
  group: ['./*', '../*'],
  message: 'Use the @/ path alias instead of relative imports (CLAUDE.md).',
};

/** Core / app-shell code must never import the framework tier. */
const frameworkBan = {
  group: ['@/lib/framework', '@/lib/framework/*'],
  message:
    'Core / app-shell code must not import @/lib/framework — the framework ' +
    'tier is built on core, not the reverse, and a build-time import would ' +
    'break forks without a lib/framework/ folder. Register through a Sunrise ' +
    'seam instead (see .context/framework/README.md).',
};

/** Framework code must not reach UP into its consumer, the leaf surface. */
const leafBan = {
  group: ['@/lib/app', '@/lib/app/*'],
  message:
    'Framework code must not import the leaf surface @/lib/app/** — the leaf ' +
    'app is the framework tier’s consumer (Sunrise → Daybreak → app), so this ' +
    'would invert the tier order. Expose a seam from lib/framework instead and ' +
    'let the leaf call it.',
};

export default [
  // Deliberate boundary-violation fixtures. They intentionally break the
  // core → framework rule so `scripts/boundary/check.ts` can prove it still
  // bites (it lints them with `--no-ignore`). Globally ignored so they never
  // fail a normal `npm run lint`.
  {
    ignores: ['scripts/boundary/fixtures/**'],
  },

  // ── Core → framework tier boundary (Daybreak three-tier model) ────────────
  // Sunrise-core and app-shell code must never import `@/lib/framework`. Not
  // just hygiene: a static `@/lib/framework` specifier resolves at BUILD time,
  // so an upstream Sunrise (or a sibling fork like ConQuest) with no
  // `lib/framework/` folder would fail `next build`. The reference must be
  // ABSENT from core, not runtime-guarded.
  //
  // Applies to every TS file EXCEPT the two tiers that legitimately touch the
  // framework: `lib/framework/**` (it IS the framework — see the tier block
  // below) and `lib/app/**` (the leaf, built ON the framework — it keeps its
  // own Sunrise `lib/app` rules and the sanctioned boot bridge
  // `instrumentation.ts → lib/app/bootstrap.ts → @/lib/framework`). Framework
  // test files are exempted too (they must import what they exercise; a test
  // ships in no build) — and, for the same reason, framework smoke scripts
  // (`scripts/smoke/**`): dev/CI tooling run via `tsx`, never part of `next
  // build`, that must import the framework code it exercises (e.g. the engine
  // write-path smoke drives `applyEvent`). The `@/`-alias ban still applies via
  // the root block, so relative imports stay banned there.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['lib/framework/**', 'lib/app/**', 'tests/**/lib/framework/**', 'scripts/smoke/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [aliasBan, frameworkBan] }],
    },
  },

  // ── Framework tier ───────────────────────────────────────────────────────
  // `lib/framework/**` + its reserved admin surfaces (the `app/admin/framework`
  // + `app/api/v1/**/framework` routes and the `components/admin/framework`
  // admin components — governed as framework tier from day one, before the
  // first page lands) + the framework's own tests. Framework → core is allowed;
  // framework → leaf (`@/lib/app/**`) is not (it would invert the tier order).
  // The `@/lib/framework` self-ban is deliberately dropped here — a framework
  // module importing a sibling is fine.
  {
    files: [
      'lib/framework/**/*.{ts,tsx}',
      'app/admin/framework/**/*.{ts,tsx}',
      'components/admin/framework/**/*.{ts,tsx}',
      'app/api/v1/admin/framework/**/*.{ts,tsx}',
      'app/api/v1/framework/**/*.{ts,tsx}',
      'tests/**/lib/framework/**/*.{ts,tsx}',
      'tests/**/app/api/v1/framework/**/*.{ts,tsx}',
      'tests/**/app/admin/framework/**/*.{ts,tsx}',
      'tests/**/components/admin/framework/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [aliasBan, leafBan] }],
    },
  },
];

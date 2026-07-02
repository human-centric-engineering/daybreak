/**
 * Pure boundary-check logic (no filesystem, no process) so it can be unit-tested
 * against in-memory samples. The CLI wrapper (`scripts/boundary/check.ts`) reads
 * the tree and feeds these functions; the self-tests in
 * `tests/unit/scripts/boundary/lib.test.ts` feed them known-good / known-bad
 * samples so the checks themselves can't silently rot.
 *
 * These enforce two of f-bootstrap's three boundary mechanisms (Appendix B / X6);
 * the third — the core → framework *import* ban — is enforced by ESLint and
 * asserted via a deliberate-violation fixture (see `check.ts`). See
 * `.context/framework/planning/f-bootstrap.md`.
 */

/** The prefix every framework-owned table and migration slug carries. */
export const FRAMEWORK_PREFIX = 'framework_';

// ── 1. Migration hygiene ────────────────────────────────────────────────────
//
// A `framework_`-named migration may contain ONLY `framework_*` DDL; a
// non-framework (Sunrise / leaf) migration may contain NO `framework_*` DDL. The
// two never mix in one migration — that keeps the framework's schema history a
// clean, forkable stream and lets an upstream Sunrise merge reason about DDL
// ownership by folder name alone (ESLint can't see SQL, so this is script-based).

export interface MigrationFile {
  /** Migration folder name, e.g. `20260702120000_framework_add_modules`. */
  name: string;
  /** Raw contents of the folder's `migration.sql`. */
  sql: string;
}

export interface MigrationHygieneViolation {
  migration: string;
  reason: string;
  /** The offending table names that triggered the violation. */
  tables: string[];
}

/** True when a migration folder name marks it as framework-owned. */
export function isFrameworkMigration(name: string): boolean {
  // Strip the leading `<timestamp>_` Prisma prefix, then test the slug.
  const slug = name.replace(/^\d+_/, '');
  return slug.startsWith(FRAMEWORK_PREFIX);
}

/**
 * Extract every table a migration's SQL structurally OWNS or MODIFIES — the
 * targets of CREATE / ALTER / DROP TABLE and CREATE [UNIQUE] INDEX … ON …. This
 * is the ownership signal migration hygiene keys on: which tables' *structure*
 * this migration touches.
 *
 * Deliberately NOT extracted: foreign-key `REFERENCES <table>` targets. A
 * framework table legitimately references a core table (e.g.
 * `framework_module.userId → "User"`) — the framework tier is built ON core, so
 * a framework→core FK is allowed and must not read as "this migration modifies
 * core". Hygiene is about DDL ownership, not the FK graph.
 *
 * Handles: optional `IF [NOT] EXISTS`, `ALTER TABLE ONLY`, an optional
 * (quoted or bare) `schema.` qualifier, and optional double-quotes. SQL comments
 * are stripped first so DDL-looking text inside them can't manufacture phantom
 * tables. The index match is anchored to `CREATE … INDEX … ON` so it can never
 * mistake an `ON DELETE` / `ON UPDATE` / `ON CONFLICT` action clause for a table.
 * Lower-cased, de-duplicated.
 */
export function extractTables(sql: string): string[] {
  const tables = new Set<string>();

  // Strip `-- line` and `/* block */` comments first.
  const cleaned = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

  // An (optionally schema-qualified) table identifier — quoted or bare, on the
  // qualifier as well as the name. Captures the final name segment.
  const ident = '(?:(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?';

  const patterns = [
    // CREATE / ALTER / DROP TABLE [ONLY] [IF [NOT] EXISTS] <table>
    new RegExp(
      `(?:CREATE|ALTER|DROP)\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+(?:NOT\\s+)?EXISTS\\s+)?${ident}`,
      'gi'
    ),
    // CREATE [UNIQUE] INDEX … ON <table> — anchored to the index statement so
    // `ON DELETE` / `ON UPDATE` / `ON CONFLICT` action clauses never match.
    new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\b[\\s\\S]*?\\sON\\s+${ident}`, 'gi'),
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      if (m[1]) tables.add(m[1].toLowerCase());
    }
  }
  return [...tables];
}

/**
 * Check every migration for tier mixing. Returns one violation per offending
 * migration (empty array = clean).
 */
export function checkMigrationHygiene(migrations: MigrationFile[]): MigrationHygieneViolation[] {
  const violations: MigrationHygieneViolation[] = [];

  for (const { name, sql } of migrations) {
    const tables = extractTables(sql);
    const frameworkTables = tables.filter((t) => t.startsWith(FRAMEWORK_PREFIX));
    const otherTables = tables.filter((t) => !t.startsWith(FRAMEWORK_PREFIX));

    if (isFrameworkMigration(name)) {
      if (otherTables.length > 0) {
        violations.push({
          migration: name,
          reason: `framework_ migration touches non-framework_ tables`,
          tables: otherTables,
        });
      }
    } else if (frameworkTables.length > 0) {
      violations.push({
        migration: name,
        reason: `non-framework migration touches framework_ tables`,
        tables: frameworkTables,
      });
    }
  }

  return violations;
}

// ── 2. Zero framework vocabulary in core ────────────────────────────────────
//
// Framework-coined identifiers must never appear in Sunrise-core code — the
// vocabulary lives only on the framework side of the boundary (`lib/framework/`,
// `framework-*.prisma`). A `moduleId` on a core type fails; the GENERIC carrier
// `CapabilityContext.scope` (a `Record<string, string>`) passes — which is why
// the generic word `scope` is deliberately NOT on the denylist.
//
// The list is intentionally the coined, unambiguous identifiers only, so it can't
// false-positive on ordinary English or unrelated code (verified: zero core hits
// at introduction).

export const FRAMEWORK_VOCAB = ['moduleSlug', 'nodeKey', 'moduleId', 'dataSlot'] as const;

export interface VocabHit {
  path: string;
  token: string;
  line: number;
}

export interface SourceFile {
  path: string;
  content: string;
}

/**
 * Scan core source files for any framework-coined identifier. Matches on a
 * word boundary so `moduleId` does not match `submoduleIdentifier`, and returns
 * one hit per (file, token, line).
 */
export function scanForFrameworkVocab(
  files: SourceFile[],
  vocab: readonly string[] = FRAMEWORK_VOCAB
): VocabHit[] {
  const hits: VocabHit[] = [];
  const matchers = vocab.map((token) => ({
    token,
    re: new RegExp(`\\b${token}\\b`),
  }));

  for (const { path, content } of files) {
    const lines = content.split('\n');
    lines.forEach((text, i) => {
      for (const { token, re } of matchers) {
        if (re.test(text)) hits.push({ path, token, line: i + 1 });
      }
    });
  }
  return hits;
}

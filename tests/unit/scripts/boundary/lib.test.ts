import { describe, expect, it } from 'vitest';

import {
  checkMigrationHygiene,
  extractTables,
  isFrameworkMigration,
  scanForFrameworkVocab,
  type MigrationFile,
} from '@/scripts/boundary/lib';

describe('isFrameworkMigration', () => {
  it('recognises a framework_ slug after the timestamp', () => {
    expect(isFrameworkMigration('20260702120000_framework_add_modules')).toBe(true);
  });

  it('rejects a core migration slug', () => {
    expect(isFrameworkMigration('20260629120000_add_knowledge_document_slug')).toBe(false);
  });

  it('does not match a mid-slug "framework" token', () => {
    // Only a slug that *starts* with framework_ is framework-owned.
    expect(isFrameworkMigration('20260702120000_rework_framework_notes')).toBe(false);
  });
});

describe('extractTables', () => {
  it('pulls table names from CREATE / ALTER / DROP TABLE with quotes and IF EXISTS', () => {
    const sql = `
      CREATE TABLE "framework_module" ("id" TEXT);
      ALTER TABLE "ai_agent" ADD COLUMN "x" TEXT;
      DROP TABLE IF EXISTS "old_thing";
    `;
    expect(extractTables(sql).sort()).toEqual(['ai_agent', 'framework_module', 'old_thing']);
  });

  it('pulls the target table from CREATE INDEX ... ON', () => {
    const sql = `CREATE UNIQUE INDEX "idx_x" ON "framework_slot" ("moduleSlug");`;
    expect(extractTables(sql)).toContain('framework_slot');
  });

  it('handles schema-qualified identifiers', () => {
    const sql = `CREATE TABLE "public"."framework_map" ("id" TEXT);`;
    expect(extractTables(sql)).toEqual(['framework_map']);
  });
});

describe('checkMigrationHygiene', () => {
  const clean: MigrationFile[] = [
    {
      name: '20260702120000_framework_add_modules',
      sql: `CREATE TABLE "framework_module" ("id" TEXT);
            CREATE INDEX "idx_m" ON "framework_module" ("id");`,
    },
    {
      name: '20260629120000_add_knowledge_document_slug',
      sql: `ALTER TABLE "ai_knowledge_document" ADD COLUMN "slug" TEXT;`,
    },
  ];

  it('passes a clean tree (framework migration = only framework_ DDL)', () => {
    expect(checkMigrationHygiene(clean)).toEqual([]);
  });

  it('flags a framework migration that touches a core table', () => {
    const violations = checkMigrationHygiene([
      {
        name: '20260702120000_framework_add_modules',
        sql: `CREATE TABLE "framework_module" ("id" TEXT);
              ALTER TABLE "ai_agent" ADD COLUMN "moduleSlug" TEXT;`,
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.tables).toEqual(['ai_agent']);
    expect(violations[0]?.reason).toMatch(/non-framework_ tables/);
  });

  it('flags a core migration that touches a framework_ table', () => {
    const violations = checkMigrationHygiene([
      {
        name: '20260702130000_add_something',
        sql: `CREATE TABLE "framework_slot" ("id" TEXT);`,
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.tables).toEqual(['framework_slot']);
    expect(violations[0]?.reason).toMatch(/framework_ tables/);
  });

  it('returns no violations for an empty migration set', () => {
    expect(checkMigrationHygiene([])).toEqual([]);
  });
});

describe('scanForFrameworkVocab', () => {
  it('flags a framework-coined identifier in a core file', () => {
    const hits = scanForFrameworkVocab([
      { path: 'lib/orchestration/context.ts', content: 'interface Ctx {\n  moduleId: string;\n}' },
    ]);
    expect(hits).toEqual([{ path: 'lib/orchestration/context.ts', token: 'moduleId', line: 2 }]);
  });

  it('does NOT flag the generic `scope` carrier', () => {
    const hits = scanForFrameworkVocab([
      { path: 'lib/orchestration/capability.ts', content: 'scope?: Record<string, string>;' },
    ]);
    expect(hits).toEqual([]);
  });

  it('respects word boundaries (no partial-token matches)', () => {
    const hits = scanForFrameworkVocab([
      { path: 'lib/x.ts', content: 'const submoduleIdentifier = 1; const nodeKeys = [];' },
    ]);
    expect(hits).toEqual([]);
  });

  it('reports one hit per (file, token, line)', () => {
    const hits = scanForFrameworkVocab([
      { path: 'lib/a.ts', content: 'moduleSlug\nnodeKey' },
      { path: 'lib/b.ts', content: 'dataSlot' },
    ]);
    expect(hits).toEqual([
      { path: 'lib/a.ts', token: 'moduleSlug', line: 1 },
      { path: 'lib/a.ts', token: 'nodeKey', line: 2 },
      { path: 'lib/b.ts', token: 'dataSlot', line: 1 },
    ]);
  });
});

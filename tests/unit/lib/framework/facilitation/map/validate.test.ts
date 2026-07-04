/**
 * Unit tests — facilitation map referential integrity (f-map t-1).
 *
 * `validateMapFormat` runs on a Zod-parsed snapshot and catches the cross-element
 * violations the schema can't see: duplicate keys, dangling edge endpoints,
 * region refs that don't resolve or point at a non-region, and region-containment
 * cycles. Each fixture is parsed through `mapDefinitionSchema` first, so these
 * exercise the real parse → validate chain the version service (t-2) will use.
 *
 * @see lib/framework/facilitation/map/validate.ts
 */

import { describe, it, expect } from 'vitest';
// Import the pure format modules directly (not the barrel), so these DB-free tests
// don't transitively load the Prisma-bound version service (f-module-core convention).
import { mapDefinitionSchema } from '@/lib/framework/facilitation/map/schema';
import { validateMapFormat } from '@/lib/framework/facilitation/map/validate';

/** Parse raw input into a MapDefinition (all fixtures here are per-element valid). */
function parse(raw: unknown) {
  return mapDefinitionSchema.parse(raw);
}

function codes(raw: unknown): string[] {
  return validateMapFormat(parse(raw)).errors.map((e) => e.code);
}

describe('validateMapFormat', () => {
  it('passes a clean map with regions and resolved edges', () => {
    const result = validateMapFormat(
      parse({
        nodes: [
          { key: 'region-a', type: 'region' },
          { key: 'n1', type: 'milestone', region: 'region-a' },
          { key: 'n2', type: 'module', moduleSlug: 'm' },
        ],
        edges: [{ from: 'n1', to: 'n2', type: 'prerequisite' }],
      })
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('passes the empty map', () => {
    expect(validateMapFormat(parse({ nodes: [], edges: [] }))).toEqual({ ok: true, errors: [] });
  });

  it('flags a duplicate node key once', () => {
    const errors = validateMapFormat(
      parse({
        nodes: [
          { key: 'dup', type: 'stage' },
          { key: 'dup', type: 'milestone' },
        ],
        edges: [],
      })
    ).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'DUPLICATE_NODE_KEY', path: ['dup'] });
  });

  it('flags an edge endpoint that references no node', () => {
    const errors = validateMapFormat(
      parse({
        nodes: [{ key: 'a', type: 'stage' }],
        edges: [{ from: 'a', to: 'ghost', type: 'unlocks' }],
      })
    ).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'DANGLING_EDGE_ENDPOINT', path: ['edges[0]'] });
  });

  it('reports a self-referential edge to a missing node only once', () => {
    const errors = validateMapFormat(
      parse({ nodes: [], edges: [{ from: 'ghost', to: 'ghost', type: 'unlocks' }] })
    ).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'DANGLING_EDGE_ENDPOINT', path: ['edges[0]'] });
  });

  it('flags a region ref to a non-existent node', () => {
    expect(
      codes({ nodes: [{ key: 'n', type: 'milestone', region: 'nowhere' }], edges: [] })
    ).toEqual(['DANGLING_REGION_REF']);
  });

  it('flags a region ref that points at a non-region node', () => {
    expect(
      codes({
        nodes: [
          { key: 'not-a-region', type: 'stage' },
          { key: 'n', type: 'milestone', region: 'not-a-region' },
        ],
        edges: [],
      })
    ).toEqual(['REGION_REF_NOT_REGION']);
  });

  it('flags a two-node region containment cycle once', () => {
    const errors = validateMapFormat(
      parse({
        nodes: [
          { key: 'a', type: 'region', region: 'b' },
          { key: 'b', type: 'region', region: 'a' },
        ],
        edges: [],
      })
    ).errors;
    expect(errors.filter((e) => e.code === 'REGION_CYCLE')).toHaveLength(1);
  });

  it('flags a self-referential region as a cycle', () => {
    expect(codes({ nodes: [{ key: 'a', type: 'region', region: 'a' }], edges: [] })).toContain(
      'REGION_CYCLE'
    );
  });

  it('accumulates multiple independent errors', () => {
    const errors = validateMapFormat(
      parse({
        nodes: [
          { key: 'dup', type: 'stage' },
          { key: 'dup', type: 'stage' },
          { key: 'n', type: 'milestone', region: 'ghost' },
        ],
        edges: [{ from: 'n', to: 'missing', type: 'prerequisite' }],
      })
    ).errors;
    expect(errors.map((e) => e.code).sort()).toEqual([
      'DANGLING_EDGE_ENDPOINT',
      'DANGLING_REGION_REF',
      'DUPLICATE_NODE_KEY',
    ]);
  });
});

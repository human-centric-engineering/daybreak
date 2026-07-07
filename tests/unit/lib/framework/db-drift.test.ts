/**
 * Framework drift-probe registration (f-overlays t-1). Proves `registerFrameworkDriftProbes()`
 * registers the HNSW node-embedding probe into the shared app-drift registry (the bridge consumed by
 * `scripts/db/check-drift.ts`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { registerFrameworkDriftProbes } from '@/lib/framework/db-drift';
import { getAppDriftProbes, resetAppDriftProbes } from '@/lib/db/drift-probes';

beforeEach(() => resetAppDriftProbes());

describe('registerFrameworkDriftProbes', () => {
  it('registers the framework_node_embedding HNSW index probe', () => {
    registerFrameworkDriftProbes();
    const probes = getAppDriftProbes();
    const hnsw = probes.find((p) => p.table === 'framework_node_embedding');
    expect(hnsw).toBeDefined();
    expect(hnsw?.kind).toBe('HNSW index');
    expect(hnsw?.name).toContain('idx_framework_node_embedding');
    expect(typeof hnsw?.probe).toBe('function');
  });
});

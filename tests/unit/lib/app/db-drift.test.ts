/**
 * Unit test — the app drift-probe bridge (f-overlays t-1).
 *
 * `registerAppDriftProbes()` (the fork-owned `lib/app/db-drift.ts`, called by
 * `scripts/db/check-drift.ts`) registers the framework tier's drift probes, then delegates to the
 * empty leaf hook — the drift analogue of the boot / admin-nav bridges. This asserts the end-to-end
 * wiring the drift check relies on: after the bridge runs, the framework HNSW probe is in the registry.
 *
 * @see lib/app/db-drift.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { registerAppDriftProbes } from '@/lib/app/db-drift';
import { getAppDriftProbes, resetAppDriftProbes } from '@/lib/db/drift-probes';

describe('registerAppDriftProbes (framework drift-probe wiring)', () => {
  beforeEach(() => resetAppDriftProbes());

  it('wires the framework node-embedding HNSW probe into the registry', () => {
    registerAppDriftProbes();
    const probes = getAppDriftProbes();
    expect(probes.some((p) => p.table === 'framework_node_embedding')).toBe(true);
  });

  it('does not throw when the leaf hook is empty (delegation is safe)', () => {
    expect(() => registerAppDriftProbes()).not.toThrow();
  });
});

/**
 * Per-agent slot exposure (f-slot-capture t-4, v1.3 Phase 1 t-1.1). Pure — the config now
 * arrives on the `CapabilityContext` the dispatcher built (Sunrise #411), so there is no
 * binding lookup to mock and no DB to load. Proves the four states of
 * `resolveExposureConfig` (no config / valid / malformed / no resolved binding at all) and
 * the group/scope membership logic of the pure `facetAllows`.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { CapabilityContext } from '@/lib/orchestration/capabilities/types';
import {
  resolveExposureConfig,
  facetAllows,
} from '@/lib/framework/data-slots/capabilities/exposure';
import { logger } from '@/lib/logging';

/** A dispatch context carrying the binding config the dispatcher resolved. */
function context(customConfig: CapabilityContext['customConfig']): CapabilityContext {
  return { userId: 'user-1', agentId: 'agent-1', customConfig, isEnabled: true };
}

describe('resolveExposureConfig', () => {
  it('is permissive when the binding carries no config (customConfig null)', () => {
    expect(resolveExposureConfig(context(null), 'fill_slot')).toEqual({ ok: true, config: {} });
  });

  it('returns a validated config (ignoring unrelated customConfig keys)', () => {
    const result = resolveExposureConfig(
      context({ write: { groups: ['goals'] }, somethingElse: 1 }),
      'fill_slot'
    );
    expect(result).toEqual({ ok: true, config: { write: { groups: ['goals'] } } });
  });

  it('fails closed when the config is malformed (wrong-typed facet)', () => {
    expect(resolveExposureConfig(context({ read: 'everything' }), 'get_state')).toEqual({
      ok: false,
    });
  });

  it("fails closed on a typo'd axis key inside a facet (no silent allow-all widening)", () => {
    // `group`/`scope` singular would strip to `{}` (allow-all) under a non-strict facet —
    // the strict facet rejects it so a mistyped restriction never widens access.
    expect(resolveExposureConfig(context({ read: { group: ['goals'] } }), 'get_state')).toEqual({
      ok: false,
    });
  });

  it('fails closed and warns when the context carries no resolved binding (undefined)', () => {
    // Only reachable off the dispatch path — where the guard, the enablement check and the
    // rate limiter were skipped too. An allowlist must not degrade to permissive there.
    const undispatched: CapabilityContext = { userId: 'user-1', agentId: 'agent-1' };
    expect(resolveExposureConfig(undispatched, 'get_state')).toEqual({ ok: false });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no resolved binding'), {
      slug: 'get_state',
      agentId: 'agent-1',
    });
  });
});

describe('facetAllows', () => {
  it('allows everything when the facet is undefined (no restriction)', () => {
    expect(facetAllows(undefined, null, null)).toBe(true);
    expect(facetAllows(undefined, 'anything', 'global')).toBe(true);
  });

  it('enforces group membership', () => {
    expect(facetAllows({ groups: ['goals'] }, 'goals', 'global')).toBe(true);
    expect(facetAllows({ groups: ['goals'] }, 'wellbeing', 'global')).toBe(false);
  });

  it('enforces scope membership', () => {
    expect(facetAllows({ scopes: ['global'] }, 'goals', 'global')).toBe(true);
    expect(facetAllows({ scopes: ['global'] }, 'goals', 'module:onboarding')).toBe(false);
  });

  it('ANDs group and scope when both are set', () => {
    const facet = { groups: ['goals'], scopes: ['global'] };
    expect(facetAllows(facet, 'goals', 'global')).toBe(true);
    expect(facetAllows(facet, 'goals', 'module:x')).toBe(false); // right group, wrong scope
    expect(facetAllows(facet, 'wellbeing', 'global')).toBe(false); // right scope, wrong group
  });

  it('refuses a null group/scope (an open mint) under any active restriction', () => {
    expect(facetAllows({ groups: ['goals'] }, null, 'global')).toBe(false);
    expect(facetAllows({ scopes: ['global'] }, 'goals', null)).toBe(false);
  });
});

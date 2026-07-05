/**
 * Per-agent slot exposure (f-slot-capture t-4). Mocks the binding lookup so no live DB is
 * loaded. Proves the tri-state (no binding / valid / malformed) of `loadExposureConfig`
 * and the group/scope membership logic of the pure `facetAllows`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { aiAgentCapability: { findFirst: vi.fn() } } }));

import { loadExposureConfig, facetAllows } from '@/lib/framework/data-slots/capabilities/exposure';
import { prisma } from '@/lib/db/client';

beforeEach(() => vi.clearAllMocks());

describe('loadExposureConfig', () => {
  it('is permissive when the agent has no binding', async () => {
    vi.mocked(prisma.aiAgentCapability.findFirst).mockResolvedValue(null);
    expect(await loadExposureConfig('agent-1', 'fill_slot')).toEqual({ ok: true, config: {} });
  });

  it('is permissive when customConfig is null', async () => {
    vi.mocked(prisma.aiAgentCapability.findFirst).mockResolvedValue({
      customConfig: null,
    } as never);
    expect(await loadExposureConfig('agent-1', 'fill_slot')).toEqual({ ok: true, config: {} });
  });

  it('returns a validated config (ignoring unrelated customConfig keys)', async () => {
    vi.mocked(prisma.aiAgentCapability.findFirst).mockResolvedValue({
      customConfig: { write: { groups: ['goals'] }, somethingElse: 1 },
    } as never);
    expect(await loadExposureConfig('agent-1', 'fill_slot')).toEqual({
      ok: true,
      config: { write: { groups: ['goals'] } },
    });
  });

  it('fails closed when the config is malformed (wrong-typed facet)', async () => {
    vi.mocked(prisma.aiAgentCapability.findFirst).mockResolvedValue({
      customConfig: { read: 'everything' },
    } as never);
    expect(await loadExposureConfig('agent-1', 'get_state')).toEqual({ ok: false });
  });

  it("fails closed on a typo'd axis key inside a facet (no silent allow-all widening)", async () => {
    // `group`/`scope` singular would strip to `{}` (allow-all) under a non-strict facet —
    // the strict facet rejects it so a mistyped restriction never widens access.
    vi.mocked(prisma.aiAgentCapability.findFirst).mockResolvedValue({
      customConfig: { read: { group: ['goals'] } },
    } as never);
    expect(await loadExposureConfig('agent-1', 'get_state')).toEqual({ ok: false });
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

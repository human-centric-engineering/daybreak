/**
 * Tests: the framework subject-data collector and the `lib/app/data-export.ts` bridge.
 *
 * The coverage guard next door proves the MANIFEST is complete. This file proves
 * the two things a complete manifest still cannot tell you: that each source
 * actually queries the column it claims to, and that the bridge folds the
 * framework and leaf tiers together without either losing the other.
 *
 * @see lib/framework/privacy/export.ts · lib/app/data-export.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * One stub delegate per framework model the manifest touches. Each records the
 * args it was called with and returns a single marker row, so a source that
 * queries the wrong column or drops its rows on the floor is visible.
 */
const findMany = {
  userJourney: vi.fn(),
  journeyEvent: vi.fn(),
  slotValue: vi.fn(),
  frameworkJourneyNudge: vi.fn(),
  facilitationGraph: vi.fn(),
  facilitationGraphVersion: vi.fn(),
  facilitationPolicy: vi.fn(),
  structureChangeProposal: vi.fn(),
  moduleVersion: vi.fn(),
  moduleWorkflowBinding: vi.fn(),
};

vi.mock('@/lib/db/client', () => ({
  prisma: {
    userJourney: { findMany: (...a: unknown[]) => findMany.userJourney(...a) },
    journeyEvent: { findMany: (...a: unknown[]) => findMany.journeyEvent(...a) },
    slotValue: { findMany: (...a: unknown[]) => findMany.slotValue(...a) },
    frameworkJourneyNudge: { findMany: (...a: unknown[]) => findMany.frameworkJourneyNudge(...a) },
    facilitationGraph: { findMany: (...a: unknown[]) => findMany.facilitationGraph(...a) },
    facilitationGraphVersion: {
      findMany: (...a: unknown[]) => findMany.facilitationGraphVersion(...a),
    },
    facilitationPolicy: { findMany: (...a: unknown[]) => findMany.facilitationPolicy(...a) },
    structureChangeProposal: {
      findMany: (...a: unknown[]) => findMany.structureChangeProposal(...a),
    },
    moduleVersion: { findMany: (...a: unknown[]) => findMany.moduleVersion(...a) },
    moduleWorkflowBinding: { findMany: (...a: unknown[]) => findMany.moduleWorkflowBinding(...a) },
  },
}));

const { collectFrameworkSubjectData } = await import('@/lib/framework/privacy/export');
const { collectAppSubjectData } = await import('@/lib/app/data-export');

const SUBJECT = { userId: 'user-1', email: 'subject@example.com' };

const NOW = new Date('2026-01-01T00:00:00.000Z');

beforeEach(() => {
  // Personal-data sources return rows verbatim.
  findMany.userJourney.mockResolvedValue([{ id: 'j1', graphSlug: 'onboarding' }]);
  findMany.journeyEvent.mockResolvedValue([
    { id: 'e1', type: 'node_entered' },
    // The non-journey engagement event — journeyId null, reachable only by userId.
    { id: 'e2', type: 'module.feedback', journeyId: null, payload: { comment: 'loved it' } },
  ]);
  findMany.slotValue.mockResolvedValue([{ id: 's1', value: 'a captured fact' }]);
  findMany.frameworkJourneyNudge.mockResolvedValue([{ id: 'n1', nodeKey: 'step-2' }]);

  // Attribution sources are narrowed to { id, label, createdAt } by the manifest.
  findMany.facilitationGraph.mockResolvedValue([{ id: 'g1', name: 'Onboarding', createdAt: NOW }]);
  findMany.facilitationGraphVersion.mockResolvedValue([
    { id: 'gv1', version: 3, createdAt: NOW, graph: { slug: 'onboarding' } },
  ]);
  findMany.facilitationPolicy.mockResolvedValue([
    { id: 'p1', kind: 'auto_approval', createdAt: NOW },
  ]);
  findMany.structureChangeProposal.mockResolvedValue([
    { id: 'pr1', subjectType: 'graph', status: 'approved', createdAt: NOW },
  ]);
  findMany.moduleVersion.mockResolvedValue([
    { id: 'mv1', version: 2, createdAt: NOW, module: { slug: 'coaching' } },
  ]);
  findMany.moduleWorkflowBinding.mockResolvedValue([
    { id: 'mw1', eventType: 'completed', createdAt: NOW, module: { slug: 'coaching' } },
  ]);
});

describe('collectFrameworkSubjectData', () => {
  it('returns the subject’s personal framework data in full', async () => {
    const result = await collectFrameworkSubjectData(SUBJECT);

    // Rows come back verbatim — an `export` source must not narrow.
    expect(result.personalData.journeys).toEqual([{ id: 'j1', graphSlug: 'onboarding' }]);
    expect(result.personalData.slotValues).toEqual([{ id: 's1', value: 'a captured fact' }]);
    expect(result.personalData.journeyNudges).toEqual([{ id: 'n1', nodeKey: 'step-2' }]);
  });

  it('includes the non-journey engagement event, which carries the subject’s own words', async () => {
    // The regression this guards: a journeyId-scoped query would drop `e2` — a
    // module.feedback row holding free-text the subject wrote — while still
    // reporting a plausible count for the events it did return.
    const result = await collectFrameworkSubjectData(SUBJECT);

    expect(result.personalData.journeyEvents).toHaveLength(2);
    expect(findMany.journeyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
  });

  it('nests node states inside the journey that owns them', async () => {
    // UserNodeState holds no user id, so no coverage scan can see it; the only
    // way it reaches the subject is this include.
    await collectFrameworkSubjectData(SUBJECT);

    expect(findMany.userJourney).toHaveBeenCalledWith(
      expect.objectContaining({ include: { nodeStates: true } })
    );
  });

  it('matches personal data on userId, not createdBy', async () => {
    await collectFrameworkSubjectData(SUBJECT);

    for (const delegate of [
      findMany.userJourney,
      findMany.journeyEvent,
      findMany.slotValue,
      findMany.frameworkJourneyNudge,
    ]) {
      expect(delegate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) })
      );
    }
  });

  it('reduces authored config to id + label + date, never its contents', async () => {
    const result = await collectFrameworkSubjectData(SUBJECT);

    expect(result.attributions.facilitationMaps).toEqual([
      { id: 'g1', label: 'Onboarding', createdAt: NOW },
    ]);
    expect(result.attributions.facilitationMapVersions).toEqual([
      { id: 'gv1', label: 'onboarding v3', createdAt: NOW },
    ]);
    expect(result.attributions.moduleWorkflowBindings).toEqual([
      { id: 'mw1', label: 'coaching → completed', createdAt: NOW },
    ]);
  });

  it('never returns a policy’s payload or a proposal’s definition', async () => {
    // These hold organisational config, not the subject's data. The manifest
    // uses `select`, so the guarantee is that the selected shape has no such key.
    const result = await collectFrameworkSubjectData(SUBJECT);

    const serialised = JSON.stringify(result.attributions);
    expect(serialised).not.toContain('payload');
    expect(serialised).not.toContain('proposedDefinition');
  });

  it('finds proposals the subject reviewed as well as those they raised', async () => {
    // `reviewedBy` is a second SET NULL FK the coverage scan does not flag
    // separately; a createdBy-only query would silently drop every proposal the
    // subject approved or rejected.
    await collectFrameworkSubjectData(SUBJECT);

    expect(findMany.structureChangeProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ createdBy: 'user-1' }, { reviewedBy: 'user-1' }] },
      })
    );
  });

  it('echoes every source into meta with its row count', async () => {
    const result = await collectFrameworkSubjectData(SUBJECT);

    // The meta block is how the subject sees the BOUNDARY of what they got.
    expect(result.meta.exported).toHaveLength(4);
    expect(result.meta.attribution).toHaveLength(6);

    const events = result.meta.exported.find((s) => s.section === 'journeyEvents');
    expect(events).toMatchObject({ model: 'JourneyEvent', rows: 2 });
    expect(events?.description.length).toBeGreaterThan(10);
  });

  it('discloses a narrowing by surfacing the source’s scopeNote in meta', async () => {
    // No framework source narrows TODAY, so this branch would otherwise never
    // run — and it is the one that keeps a narrowed source honest. A source that
    // returns only some of the subject's rows without a scopeNote is the
    // silent-omission failure at row granularity instead of table granularity:
    // the count looks like a complete answer either way.
    const { FRAMEWORK_SUBJECT_DATA_SOURCES } =
      await import('@/lib/framework/privacy/export-sources');
    FRAMEWORK_SUBJECT_DATA_SOURCES.push({
      model: 'JourneyEvent',
      section: 'narrowedProbe',
      disposition: 'export',
      description: 'A deliberately narrowed probe source.',
      scopeNote: 'Withholds rows belonging to a third party.',
      fetch: () => Promise.resolve([{ id: 'x' }]),
    });

    try {
      const result = await collectFrameworkSubjectData(SUBJECT);
      const probe = result.meta.exported.find((entry) => entry.section === 'narrowedProbe');

      expect(probe?.scopeNote).toBe('Withholds rows belonging to a third party.');
      // Sources that do NOT narrow must stay free of the key, so its presence
      // always means something.
      const slots = result.meta.exported.find((entry) => entry.section === 'slotValues');
      expect(slots && 'scopeNote' in slots).toBe(false);
    } finally {
      FRAMEWORK_SUBJECT_DATA_SOURCES.pop();
    }
  });

  it('fails the whole export when a source throws, rather than dropping a section', async () => {
    // The deliberate opposite of the erasure path. A swallowed failure here
    // yields a bundle that looks complete and is not.
    findMany.slotValue.mockRejectedValue(new Error('db down'));

    await expect(collectFrameworkSubjectData(SUBJECT)).rejects.toThrow('db down');
  });
});

describe('collectAppSubjectData bridge', () => {
  it('puts the framework tier under the reserved `framework` section', async () => {
    const result = await collectAppSubjectData(SUBJECT);

    expect(Object.keys(result)).toEqual(['framework']);
    expect(result.framework).toMatchObject({
      personalData: expect.objectContaining({ slotValues: expect.any(Array) }),
      attributions: expect.objectContaining({ facilitationMaps: expect.any(Array) }),
    });
  });

  it('contributes nothing leaf-owned by default', async () => {
    // Daybreak keeps `leaf-data-export.ts` reserved-empty; a vanilla Daybreak
    // export must carry the framework section and nothing else.
    const result = await collectAppSubjectData(SUBJECT);

    expect(Object.keys(result)).not.toContain('bookings');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('propagates a framework failure instead of returning a partial bundle', async () => {
    findMany.facilitationGraph.mockRejectedValue(new Error('db down'));

    await expect(collectAppSubjectData(SUBJECT)).rejects.toThrow('db down');
  });
});

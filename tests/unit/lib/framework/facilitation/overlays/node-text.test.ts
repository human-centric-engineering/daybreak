/**
 * Node embedding-text composer (f-overlays t-1). Pure — no mocks. Proves module nodes carry the
 * registered module's name/description, non-module nodes fall back to key/type/stage/region, and
 * string-valued meta is surfaced while non-string meta is dropped.
 */

import { describe, it, expect } from 'vitest';
import { composeNodeText } from '@/lib/framework/facilitation/overlays/node-text';
import type { MapNode } from '@/lib/framework/facilitation/map/schema';

const node = (over: Partial<MapNode>): MapNode => ({
  key: 'n1',
  type: 'stage',
  completionMode: 'once',
  ...over,
});

describe('composeNodeText', () => {
  it('leads with the module name + description for a module node', () => {
    const text = composeNodeText(node({ key: 'intro', type: 'module', moduleSlug: 'onboarding' }), {
      name: 'Onboarding',
      description: 'Get set up and oriented.',
    });
    expect(text).toContain('Module: Onboarding');
    expect(text).toContain('Get set up and oriented.');
    expect(text).toContain('Node: intro');
    expect(text).toContain('Type: module');
  });

  it('omits the module block when no module info is supplied', () => {
    const text = composeNodeText(node({ key: 'm', type: 'milestone' }));
    expect(text).not.toContain('Module:');
    expect(text).toContain('Node: m');
    expect(text).toContain('Type: milestone');
  });

  it('includes stage and region when present', () => {
    const text = composeNodeText(node({ stage: 'foundations', region: 'core' }));
    expect(text).toContain('Stage: foundations');
    expect(text).toContain('Region: core');
  });

  it('surfaces string meta values and drops non-string ones', () => {
    const text = composeNodeText(node({ meta: { theme: 'trust', weight: 3, tags: ['a'] } }));
    expect(text).toContain('theme: trust');
    expect(text).not.toContain('weight');
    expect(text).not.toContain('tags');
  });

  it('skips an empty module description without a dangling blank line', () => {
    const text = composeNodeText(node({ type: 'module', moduleSlug: 's' }), {
      name: 'Bare',
      description: '   ',
    });
    expect(text).toContain('Module: Bare');
    expect(text.split('\n')).not.toContain('   ');
  });
});

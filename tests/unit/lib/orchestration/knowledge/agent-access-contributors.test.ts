/**
 * Agent knowledge-access contributor registry (the generic core seam).
 *
 * Pure registry behaviour: register, list in order, replace-by-key (idempotent
 * re-registration), and the test reset. The resolver's use of these is covered in
 * resolveAgentDocumentAccess.test.ts.
 *
 * @see lib/orchestration/knowledge/agent-access-contributors.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAgentAccessContributor,
  getAgentAccessContributors,
  __resetAgentAccessContributorsForTests,
} from '@/lib/orchestration/knowledge/agent-access-contributors';

beforeEach(() => __resetAgentAccessContributorsForTests());

describe('agent access contributor registry', () => {
  it('starts empty', () => {
    expect(getAgentAccessContributors()).toEqual([]);
  });

  it('registers and lists contributors in registration order', () => {
    const a = async () => ({ documentIds: ['a'] });
    const b = async () => ({ tagIds: ['b'] });
    registerAgentAccessContributor('a', a);
    registerAgentAccessContributor('b', b);
    expect(getAgentAccessContributors()).toEqual([a, b]);
  });

  it('replaces by key (a double registration does not duplicate)', () => {
    const first = async () => ({ documentIds: ['first'] });
    const second = async () => ({ documentIds: ['second'] });
    registerAgentAccessContributor('mod', first);
    registerAgentAccessContributor('mod', second);
    const list = getAgentAccessContributors();
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(second);
  });

  it('reset clears the registry', () => {
    registerAgentAccessContributor('x', async () => ({}));
    __resetAgentAccessContributorsForTests();
    expect(getAgentAccessContributors()).toEqual([]);
  });
});

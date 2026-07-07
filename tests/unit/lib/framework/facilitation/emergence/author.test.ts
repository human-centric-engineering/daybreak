/**
 * Proposal authorship helpers (f-emergence t-2). Pure.
 */

import { describe, it, expect } from 'vitest';
import { formatAgentAuthor, parseAuthor } from '@/lib/framework/facilitation/emergence/author';

describe('formatAgentAuthor', () => {
  it('prefixes an agent slug with "agent:"', () => {
    expect(formatAgentAuthor('onboarding')).toBe('agent:onboarding');
  });
});

describe('parseAuthor', () => {
  it('parses an agent author', () => {
    expect(parseAuthor('agent:onboarding')).toEqual({ kind: 'agent', slug: 'onboarding' });
  });

  it('parses a user author (no prefix)', () => {
    expect(parseAuthor('cjld2cjxh0000qzrmn831i7rn')).toEqual({
      kind: 'user',
      userId: 'cjld2cjxh0000qzrmn831i7rn',
    });
  });

  it('round-trips a formatted agent author', () => {
    const parsed = parseAuthor(formatAgentAuthor('facilitator'));
    expect(parsed).toEqual({ kind: 'agent', slug: 'facilitator' });
  });
});

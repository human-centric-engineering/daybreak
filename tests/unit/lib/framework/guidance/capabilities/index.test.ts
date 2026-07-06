/**
 * Guidance read-capability barrel (f-guidance t-2). Asserts the registered family: the four
 * read tools, their slugs matching their function-definition names, and that all are
 * read-only (no `processesPii`), so registering them needs no `redactProvenance`.
 */

import { describe, it, expect } from 'vitest';
import { guidanceCapabilities } from '@/lib/framework/guidance/capabilities';

describe('guidanceCapabilities', () => {
  it('registers exactly the four read tools', () => {
    expect(guidanceCapabilities.map((c) => c.slug)).toEqual([
      'get_journey_state',
      'get_next_steps',
      'get_progress_synopsis',
      'suggest_focus',
    ]);
  });

  it('keeps each slug equal to its LLM function name', () => {
    for (const cap of guidanceCapabilities) {
      expect(cap.functionDefinition.name).toBe(cap.slug);
    }
  });

  it('are all read-only (not PII-processing — they surface engine/map vocabulary, not values)', () => {
    for (const cap of guidanceCapabilities) {
      expect(cap.processesPii).toBe(false);
    }
  });
});

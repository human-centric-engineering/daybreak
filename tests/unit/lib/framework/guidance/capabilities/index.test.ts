/**
 * Guidance capability barrel (f-guidance t-2/t-3). Asserts the registered family: the four
 * read tools + the write transition, their slugs matching their function-definition names,
 * and that none is PII-processing (they surface engine/map vocabulary, not slot values), so
 * registering them needs no `redactProvenance`.
 */

import { describe, it, expect } from 'vitest';
import { guidanceCapabilities } from '@/lib/framework/guidance/capabilities';

describe('guidanceCapabilities', () => {
  it('registers the four read tools + the write transition', () => {
    expect(guidanceCapabilities.map((c) => c.slug)).toEqual([
      'get_journey_state',
      'get_next_steps',
      'get_progress_synopsis',
      'suggest_focus',
      'request_transition',
    ]);
  });

  it('keeps each slug equal to its LLM function name', () => {
    for (const cap of guidanceCapabilities) {
      expect(cap.functionDefinition.name).toBe(cap.slug);
    }
  });

  it('none is PII-processing — they surface engine/map vocabulary, not captured slot values', () => {
    for (const cap of guidanceCapabilities) {
      expect(cap.processesPii).toBe(false);
    }
  });
});

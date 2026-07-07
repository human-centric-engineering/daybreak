/**
 * Engagement capability barrel (f-engagement t-2). Asserts the registered family:
 * `record_feedback`, its slug matching its function-definition name, and that it IS
 * PII-processing (it captures a free-text comment) with `redactProvenance` overridden so
 * the registry will load it.
 */

import { describe, it, expect } from 'vitest';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { engagementCapabilities } from '@/lib/framework/engagement/capabilities';

describe('engagementCapabilities', () => {
  it('registers record_feedback', () => {
    expect(engagementCapabilities.map((c) => c.slug)).toEqual(['record_feedback']);
  });

  it('keeps each slug equal to its LLM function name', () => {
    for (const cap of engagementCapabilities) {
      expect(cap.functionDefinition.name).toBe(cap.slug);
    }
  });

  it('marks record_feedback PII-processing and overrides redactProvenance (registry requirement)', () => {
    for (const cap of engagementCapabilities) {
      expect(cap.processesPii).toBe(true);
      // A processesPii capability MUST override the base redactProvenance or the registry refuses it.
      expect(cap.redactProvenance).not.toBe(BaseCapability.prototype.redactProvenance);
    }
  });
});

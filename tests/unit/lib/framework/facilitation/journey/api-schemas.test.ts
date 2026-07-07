/**
 * Journey admin-route input schemas (f-ops-views t-5a) — `listJourneysQuerySchema` /
 * `parseJourneyId`.
 *
 * The route tests exercise these end-to-end (400 on a bad limit / malformed id); this
 * unit test pins the schema contract directly: pagination defaults + caps, the optional
 * graphSlug filter, and the cuid param guard (malformed ⇒ a 400 `ValidationError`).
 */

import { describe, it, expect } from 'vitest';
import {
  listJourneysQuerySchema,
  parseJourneyId,
} from '@/lib/framework/facilitation/journey/api-schemas';
import { ValidationError } from '@/lib/api/errors';

describe('listJourneysQuerySchema', () => {
  it('applies pagination defaults and leaves graphSlug optional', () => {
    expect(listJourneysQuerySchema.parse({})).toEqual({ page: 1, limit: 10 });
  });

  it('coerces string query params and accepts a graphSlug filter', () => {
    expect(
      listJourneysQuerySchema.parse({ page: '2', limit: '25', graphSlug: 'onboarding' })
    ).toEqual({ page: 2, limit: 25, graphSlug: 'onboarding' });
  });

  it('caps limit at 100 and rejects a non-positive page', () => {
    expect(listJourneysQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listJourneysQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects an empty graphSlug (whitespace-only trims away)', () => {
    expect(listJourneysQuerySchema.safeParse({ graphSlug: '   ' }).success).toBe(false);
  });
});

describe('parseJourneyId', () => {
  it('returns a valid cuid unchanged', () => {
    const id = 'cjld2cjxh0000qzrmn831i7rn';
    expect(parseJourneyId(id)).toBe(id);
  });

  it('throws a 400 ValidationError on a malformed id', () => {
    try {
      parseJourneyId('not-a-cuid');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).status).toBe(400);
    }
  });
});

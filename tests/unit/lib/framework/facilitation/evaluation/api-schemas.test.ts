/**
 * Framework conversation-eval API schema (f-eval t-1). Pure.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreConversationBodySchema,
  parseConversationIdParam,
} from '@/lib/framework/facilitation/evaluation/api-schemas';
import { ValidationError } from '@/lib/api/errors';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('scoreConversationBodySchema', () => {
  it('accepts a valid conversationId cuid', () => {
    expect(scoreConversationBodySchema.safeParse({ conversationId: CUID }).success).toBe(true);
  });
  it('rejects a missing or non-cuid conversationId', () => {
    expect(scoreConversationBodySchema.safeParse({}).success).toBe(false);
    expect(scoreConversationBodySchema.safeParse({ conversationId: 'nope' }).success).toBe(false);
  });
});

describe('parseConversationIdParam', () => {
  it('returns a valid cuid', () => {
    expect(parseConversationIdParam(CUID)).toBe(CUID);
  });
  it('throws on a null or malformed query param', () => {
    expect(() => parseConversationIdParam(null)).toThrow(ValidationError);
    expect(() => parseConversationIdParam('not-a-cuid')).toThrow(ValidationError);
  });
});

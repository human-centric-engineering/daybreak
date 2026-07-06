/**
 * Zod → field-descriptor walker (f-module-config t-2).
 *
 * Pure, no mocks: feed real Zod schemas through `describeConfigSchema` and assert the
 * descriptor list. Covers each supported leaf (string / number / boolean / enum), the
 * optional/default → `required` semantics, min/max + description extraction, label
 * humanisation, and the raw-`json` fallback for shapes JSON Schema can't flatten
 * (nested object, array, nullable, union, unrepresentable date). Totality (never throws)
 * is asserted on the exotic cases.
 *
 * @see lib/framework/modules/config/schema-descriptors.ts
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  describeConfigSchema,
  type FieldDescriptor,
} from '@/lib/framework/modules/config/schema-descriptors';

function byKey(descriptors: FieldDescriptor[], key: string): FieldDescriptor {
  const d = descriptors.find((x) => x.key === key);
  if (!d) throw new Error(`no descriptor for "${key}"`);
  return d;
}

describe('describeConfigSchema — supported leaves', () => {
  it('describes a required string with min/max and description', () => {
    const d = byKey(
      describeConfigSchema(
        z.object({ apiUrl: z.string().min(2).max(200).describe('The endpoint') })
      ),
      'apiUrl'
    );
    expect(d).toMatchObject({
      key: 'apiUrl',
      type: 'string',
      label: 'Api Url',
      description: 'The endpoint',
      required: true,
      minLength: 2,
      maxLength: 200,
    });
  });

  it('describes an integer with min/max and marks integer:true', () => {
    const d = byKey(describeConfigSchema(z.object({ n: z.number().int().min(1).max(9) })), 'n');
    expect(d).toMatchObject({ type: 'number', integer: true, min: 1, max: 9, required: true });
  });

  it('describes a plain number as integer:false', () => {
    const d = byKey(describeConfigSchema(z.object({ ratio: z.number() })), 'ratio');
    expect(d).toMatchObject({ type: 'number', integer: false });
  });

  it('describes a boolean', () => {
    const d = byKey(describeConfigSchema(z.object({ enabled: z.boolean() })), 'enabled');
    expect(d).toMatchObject({ type: 'boolean', required: true });
  });

  it('describes an enum with its options', () => {
    const d = byKey(describeConfigSchema(z.object({ tone: z.enum(['gentle', 'direct']) })), 'tone');
    expect(d).toMatchObject({ type: 'enum', options: ['gentle', 'direct'], required: true });
  });
});

describe('describeConfigSchema — required vs optional vs default', () => {
  it('marks an optional field not required', () => {
    const d = byKey(describeConfigSchema(z.object({ label: z.string().optional() })), 'label');
    expect(d.required).toBe(false);
  });

  it('marks a defaulted field not required and carries the default (despite JSON-Schema listing it required)', () => {
    const descriptors = describeConfigSchema(
      z.object({
        tone: z.enum(['gentle', 'direct']).default('gentle'),
        sessions: z.number().int().default(3),
        enabled: z.boolean().default(true),
      })
    );
    expect(byKey(descriptors, 'tone')).toMatchObject({ required: false, default: 'gentle' });
    expect(byKey(descriptors, 'sessions')).toMatchObject({ required: false, default: 3 });
    expect(byKey(descriptors, 'enabled')).toMatchObject({ required: false, default: true });
  });

  it('humanises camelCase and snake_case keys into labels', () => {
    const descriptors = describeConfigSchema(
      z.object({ sessionLengthTarget: z.string().optional(), max_retries: z.number().optional() })
    );
    expect(byKey(descriptors, 'sessionLengthTarget').label).toBe('Session Length Target');
    expect(byKey(descriptors, 'max_retries').label).toBe('Max retries');
  });
});

describe('describeConfigSchema — json fallback (bounded + total)', () => {
  it('falls back to json for a nested object, array, nullable, and union — without throwing', () => {
    const descriptors = describeConfigSchema(
      z.object({
        nested: z.object({ a: z.string() }),
        list: z.array(z.string()),
        maybe: z.string().nullable(),
        either: z.union([z.literal('x'), z.literal('y')]),
      })
    );
    for (const key of ['nested', 'list', 'maybe', 'either']) {
      expect(byKey(descriptors, key).type).toBe('json');
    }
  });

  it('falls back to json (not a throw) for a type JSON Schema cannot represent', () => {
    const descriptors = describeConfigSchema(z.object({ when: z.date().optional() }));
    expect(byKey(descriptors, 'when').type).toBe('json');
  });
});

describe('describeConfigSchema — non-object / empty schemas', () => {
  it('returns [] for a non-object top-level schema', () => {
    expect(describeConfigSchema(z.string())).toEqual([]);
  });

  it('returns [] for an empty object schema', () => {
    expect(describeConfigSchema(z.object({}))).toEqual([]);
  });
});

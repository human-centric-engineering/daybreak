/**
 * Zod → field-descriptor walker (f-module-config t-2) — the engine behind A4's generic
 * config form.
 *
 * A module declares its admin parameters as a Zod `configSchema` (code). The client form
 * that renders those parameters cannot hold the live Zod object (the module registry is
 * server-only), so the server serialises the schema to a flat list of **field
 * descriptors** the client renders — "new module, new parameters, zero admin-UI work".
 *
 * Rather than reach into Zod's version-specific internals, this converts the schema to a
 * standard JSON Schema via Zod 4's built-in `z.toJSONSchema()` and walks THAT (a stable,
 * well-defined shape). The walker is deliberately **bounded**: it renders the flat
 * primitive cases a module config realistically uses (string / number / boolean / enum)
 * and falls back to a raw-`json` descriptor for anything richer (nested objects, arrays,
 * unions, nullable, dates, and any type JSON Schema can't represent). It is **total** —
 * it never throws on an exotic schema; the worst case is a field the client edits as raw
 * JSON. The server always re-validates a submitted config against the real Zod schema
 * (the source of truth), so a descriptor is a rendering hint, never a trust boundary.
 *
 * Note on `required`: a Zod field with a `.default()` is listed in JSON Schema's
 * `required` (its parsed output is always present), but from a *form* standpoint it is
 * NOT required-to-fill — the default covers a blank. So a descriptor is `required` only
 * when the field is in `required` AND has no default.
 */

import { z } from 'zod';

/** A single rendered config field. Discriminated on `type`; `json` is the fallback. */
export type FieldDescriptor =
  | {
      key: string;
      type: 'string';
      label: string;
      description?: string;
      required: boolean;
      default?: string;
      minLength?: number;
      maxLength?: number;
    }
  | {
      key: string;
      type: 'number';
      label: string;
      description?: string;
      required: boolean;
      default?: number;
      min?: number;
      max?: number;
      integer: boolean;
    }
  | {
      key: string;
      type: 'boolean';
      label: string;
      description?: string;
      required: boolean;
      default?: boolean;
    }
  | {
      key: string;
      type: 'enum';
      label: string;
      description?: string;
      required: boolean;
      default?: string;
      options: string[];
    }
  | {
      key: string;
      type: 'json';
      label: string;
      description?: string;
      required: boolean;
      default?: unknown;
    };

/** A JSON-Schema property node is an open bag of standard keywords — read defensively. */
type JsonSchemaProp = Record<string, unknown>;

/** `camelCase` / `snake_case` key → a "Title Case" field label. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function describeField(key: string, prop: JsonSchemaProp, inRequired: boolean): FieldDescriptor {
  const hasDefault = 'default' in prop && prop.default !== undefined;
  const label = humanizeKey(key);
  const description = typeof prop.description === 'string' ? prop.description : undefined;
  // A defaulted field is pre-fillable, so it is never "required to fill" on the form.
  const required = inRequired && !hasDefault;

  if (Array.isArray(prop.enum)) {
    return {
      key,
      type: 'enum',
      label,
      description,
      required,
      options: prop.enum.map((o) => String(o)),
      default: hasDefault ? String(prop.default) : undefined,
    };
  }

  if (prop.type === 'string') {
    return {
      key,
      type: 'string',
      label,
      description,
      required,
      default: hasDefault && typeof prop.default === 'string' ? prop.default : undefined,
      minLength: asNumber(prop.minLength),
      maxLength: asNumber(prop.maxLength),
    };
  }

  if (prop.type === 'integer' || prop.type === 'number') {
    return {
      key,
      type: 'number',
      label,
      description,
      required,
      integer: prop.type === 'integer',
      default: hasDefault && typeof prop.default === 'number' ? prop.default : undefined,
      min: asNumber(prop.minimum),
      max: asNumber(prop.maximum),
    };
  }

  if (prop.type === 'boolean') {
    return {
      key,
      type: 'boolean',
      label,
      description,
      required,
      default: hasDefault && typeof prop.default === 'boolean' ? prop.default : undefined,
    };
  }

  // Fallback: nested object, array, anyOf (nullable / union), unrepresentable ({}), etc.
  return {
    key,
    type: 'json',
    label,
    description,
    required,
    default: hasDefault ? prop.default : undefined,
  };
}

/**
 * Describe a module's `configSchema` as a flat list of renderable field descriptors.
 * Returns `[]` for a schema that isn't a top-level object (no named fields to render —
 * the config is still editable as raw JSON and validated server-side). Total: never
 * throws.
 */
export function describeConfigSchema(schema: z.ZodTypeAny): FieldDescriptor[] {
  let json: Record<string, unknown>;
  try {
    // `unrepresentable: 'any'` → a type JSON Schema can't model becomes `{}` (→ json
    // fallback) instead of throwing, keeping the walker total.
    json = z.toJSONSchema(schema, { unrepresentable: 'any' });
  } catch {
    return [];
  }

  if (json.type !== 'object' || typeof json.properties !== 'object' || json.properties === null) {
    return [];
  }
  const requiredSet = new Set<string>(
    Array.isArray(json.required)
      ? json.required.filter((k): k is string => typeof k === 'string')
      : []
  );
  return Object.entries(json.properties as Record<string, JsonSchemaProp>).map(([key, prop]) =>
    describeField(key, prop, requiredSet.has(key))
  );
}

'use client';

/**
 * ConditionBuilder (f-map-editor t-3) — the descriptor-driven builder for a gating
 * condition on a map edge. A condition rides on an edge (`edge.condition`), tagged by
 * one of the three families the schema's `z.discriminatedUnion` accepts — `state`
 * (a milestone is / isn't reached), `slot` (a learned value compares to a threshold),
 * or `temporal` (a date window or a per-node cooldown).
 *
 * The builder is **descriptor-driven**: the family / operator / temporal-kind
 * vocabularies below drive the selects, and every field edit rebuilds a candidate
 * condition and validates it against `conditionSchema` — so the parent only ever
 * receives a *valid* `MapCondition` (or `undefined` when the family is "none" or the
 * fields are still incomplete). That keeps the invalid-intermediate states local: a
 * half-typed condition is simply "no gate yet", flagged inline, never persisted.
 *
 * It is remounted per edge (the parent keys it on the edge id), so its local field
 * state re-seeds cleanly from each newly-selected edge's condition.
 */

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldHelp } from '@/components/ui/field-help';
import { cn } from '@/lib/utils';
import {
  conditionSchema,
  type ConditionFamily,
  type MapCondition,
  type TemporalKind,
} from '@/lib/framework/facilitation/map/schema';

export interface ConditionBuilderProps {
  condition: MapCondition | undefined;
  /** Node keys on the canvas — suggestions for the `state` family's milestone field. */
  nodeKeys: readonly string[];
  /** Registered slot-definition slugs — suggestions for the `slot` family's slug field. */
  slotOptions: readonly string[];
  onChange: (condition: MapCondition | undefined) => void;
}

/** The value-type toggle for a slot comparison (the schema's `number|string|boolean`). */
type SlotValueType = 'number' | 'string' | 'boolean';

/** Flat, per-family field bag — one working copy the builder edits and re-validates. */
interface ConditionFields {
  family: 'none' | ConditionFamily;
  // state
  milestone: string;
  reached: boolean;
  // slot
  slug: string;
  op: 'gte' | 'lte' | 'eq';
  valueType: SlotValueType;
  value: string;
  minConfidence: string;
  // temporal
  kind: TemporalKind;
  at: string;
  durationHours: string;
}

// ─── Descriptor vocabularies (drive the selects) ─────────────────────────────

const FAMILY_OPTIONS: { value: ConditionFields['family']; label: string }[] = [
  { value: 'none', label: 'No condition (always open)' },
  { value: 'state', label: 'State — a milestone is / isn’t reached' },
  { value: 'slot', label: 'Slot — a learned value vs a threshold' },
  { value: 'temporal', label: 'Temporal — a date window or cooldown' },
];

const REACHED_OPTIONS: { value: string; label: string }[] = [
  { value: 'true', label: 'is reached' },
  { value: 'false', label: 'is NOT reached' },
];

const SLOT_OP_OPTIONS: { value: ConditionFields['op']; label: string }[] = [
  { value: 'gte', label: '≥ at least' },
  { value: 'lte', label: '≤ at most' },
  { value: 'eq', label: '= equals' },
];

const VALUE_TYPE_OPTIONS: { value: SlotValueType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'string', label: 'Text' },
  { value: 'boolean', label: 'Boolean' },
];

const BOOLEAN_VALUE_OPTIONS: { value: string; label: string }[] = [
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' },
];

const TEMPORAL_KIND_OPTIONS: { value: TemporalKind; label: string }[] = [
  { value: 'available_after', label: 'Available after a date' },
  { value: 'available_until', label: 'Available until a date' },
  { value: 'recommended_by', label: 'Recommended by a date' },
  { value: 'cooldown_since_last_visit', label: 'Cooldown since last visit' },
];

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none';

/** Seed the flat field bag from an existing condition (or the family defaults). */
function seedFields(condition: MapCondition | undefined): ConditionFields {
  return {
    family: condition?.family ?? 'none',
    milestone: condition?.family === 'state' ? condition.milestone : '',
    reached: condition?.family === 'state' ? condition.reached : true,
    slug: condition?.family === 'slot' ? condition.slug : '',
    op: condition?.family === 'slot' ? condition.op : 'gte',
    valueType: condition?.family === 'slot' ? (typeof condition.value as SlotValueType) : 'number',
    value: condition?.family === 'slot' ? String(condition.value) : '',
    minConfidence:
      condition?.family === 'slot' && condition.minConfidence !== undefined
        ? String(condition.minConfidence)
        : '',
    kind: condition?.family === 'temporal' ? condition.kind : 'available_after',
    at: condition?.family === 'temporal' ? (condition.at ?? '') : '',
    durationHours:
      condition?.family === 'temporal' && condition.durationHours !== undefined
        ? String(condition.durationHours)
        : '',
  };
}

/**
 * Build the raw condition object for the active family from the field bag. Returns
 * `null` for the "none" family. The result is deliberately un-parsed — the caller
 * validates it against `conditionSchema`, so an incomplete field (empty number →
 * `NaN`, missing `at`) fails the parse and surfaces as "incomplete", never persists.
 */
function buildRaw(fields: ConditionFields): unknown {
  switch (fields.family) {
    case 'state':
      return { family: 'state', milestone: fields.milestone, reached: fields.reached };
    case 'slot': {
      const value: unknown =
        fields.valueType === 'number'
          ? fields.value.trim() === ''
            ? Number.NaN
            : Number(fields.value)
          : fields.valueType === 'boolean'
            ? fields.value === 'true'
            : fields.value;
      return {
        family: 'slot',
        slug: fields.slug,
        op: fields.op,
        value,
        ...(fields.minConfidence.trim() === ''
          ? {}
          : { minConfidence: Number(fields.minConfidence) }),
      };
    }
    case 'temporal':
      return {
        family: 'temporal',
        kind: fields.kind,
        ...(fields.kind === 'cooldown_since_last_visit'
          ? fields.durationHours.trim() === ''
            ? {}
            : { durationHours: Number(fields.durationHours) }
          : fields.at.trim() === ''
            ? {}
            : { at: fields.at }),
      };
    default:
      return null;
  }
}

/** Parse the field bag into a valid condition, or `undefined` if none / incomplete. */
function toCondition(fields: ConditionFields): MapCondition | undefined {
  if (fields.family === 'none') return undefined;
  const parsed = conditionSchema.safeParse(buildRaw(fields));
  return parsed.success ? parsed.data : undefined;
}

export function ConditionBuilder({
  condition,
  nodeKeys,
  slotOptions,
  onChange,
}: ConditionBuilderProps) {
  const [fields, setFields] = useState<ConditionFields>(() => seedFields(condition));

  // Edit + emit in one step: every field change rebuilds the condition and hands the
  // parent the parsed value (or `undefined`). No effect, so no feedback loop.
  const update = (patch: Partial<ConditionFields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    onChange(toCondition(next));
  };

  const incomplete = fields.family !== 'none' && toCondition(fields) === undefined;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="cond-family" className="text-xs">
          Gating condition{' '}
          <FieldHelp title="Gating condition">
            <p>
              An optional gate on this edge. The engine evaluates it to decide whether the edge
              applies — e.g. a prerequisite only counts once its condition holds.
            </p>
            <p className="mt-2">
              Pick a <strong>family</strong>: <em>state</em> (a milestone reached), <em>slot</em> (a
              learned value vs a threshold), or <em>temporal</em> (a date window or cooldown).
              Default: <code>No condition</code>.
            </p>
          </FieldHelp>
        </Label>
        <select
          id="cond-family"
          data-testid="condition-family"
          className={cn(SELECT_CLASS, 'mt-1')}
          value={fields.family}
          onChange={(e) => update({ family: e.target.value as ConditionFields['family'] })}
        >
          {FAMILY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {fields.family === 'state' && (
        <div className="flex flex-col gap-2">
          <div>
            <Label htmlFor="cond-milestone" className="text-xs">
              Milestone node key{' '}
              <FieldHelp title="Milestone node key">
                <p>
                  The key of the node this gate depends on — usually a milestone or place elsewhere
                  on this map. The engine checks whether the user has (or hasn&rsquo;t) reached it.
                  Type to search the map&rsquo;s node keys.
                </p>
              </FieldHelp>
            </Label>
            <Input
              id="cond-milestone"
              list="cond-milestone-options"
              data-testid="condition-milestone"
              className="mt-1 h-9"
              value={fields.milestone}
              placeholder="node key"
              onChange={(e) => update({ milestone: e.target.value })}
            />
            <datalist id="cond-milestone-options">
              {nodeKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="cond-reached" className="text-xs">
              Reached state
            </Label>
            <select
              id="cond-reached"
              data-testid="condition-reached"
              className={cn(SELECT_CLASS, 'mt-1')}
              value={String(fields.reached)}
              onChange={(e) => update({ reached: e.target.value === 'true' })}
            >
              {REACHED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {fields.family === 'slot' && (
        <div className="flex flex-col gap-2">
          <div>
            <Label htmlFor="cond-slot-slug" className="text-xs">
              Slot slug{' '}
              <FieldHelp title="Slot slug">
                <p>
                  The registered data-slot whose learned value this gate reads (e.g.{' '}
                  <code>confidence</code>, <code>streak</code>). The comparison below runs against
                  the slot&rsquo;s typed value. Type to search the registered slot definitions.
                </p>
              </FieldHelp>
            </Label>
            <Input
              id="cond-slot-slug"
              list="cond-slot-options"
              data-testid="condition-slot-slug"
              className="mt-1 h-9"
              value={fields.slug}
              placeholder="slot-slug"
              onChange={(e) => update({ slug: e.target.value })}
            />
            <datalist id="cond-slot-options">
              {slotOptions.map((slug) => (
                <option key={slug} value={slug} />
              ))}
            </datalist>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="cond-slot-op" className="text-xs">
                Compare
              </Label>
              <select
                id="cond-slot-op"
                data-testid="condition-slot-op"
                className={cn(SELECT_CLASS, 'mt-1')}
                value={fields.op}
                onChange={(e) => update({ op: e.target.value as ConditionFields['op'] })}
              >
                {SLOT_OP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Label htmlFor="cond-slot-type" className="text-xs">
                Type{' '}
                <FieldHelp title="Value type">
                  <p>
                    Slots store typed values. Match the comparison to the slot&rsquo;s stored form —
                    a numeric threshold, an exact text match, or a boolean flag. Default:{' '}
                    <code>Number</code>.
                  </p>
                </FieldHelp>
              </Label>
              <select
                id="cond-slot-type"
                data-testid="condition-slot-type"
                className={cn(SELECT_CLASS, 'mt-1')}
                value={fields.valueType}
                onChange={(e) => update({ valueType: e.target.value as SlotValueType })}
              >
                {VALUE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="cond-slot-value" className="text-xs">
              Value
            </Label>
            {fields.valueType === 'boolean' ? (
              <select
                id="cond-slot-value"
                data-testid="condition-slot-value"
                className={cn(SELECT_CLASS, 'mt-1')}
                value={fields.value === 'true' ? 'true' : 'false'}
                onChange={(e) => update({ value: e.target.value })}
              >
                {BOOLEAN_VALUE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="cond-slot-value"
                data-testid="condition-slot-value"
                className="mt-1 h-9"
                inputMode={fields.valueType === 'number' ? 'decimal' : 'text'}
                value={fields.value}
                onChange={(e) => update({ value: e.target.value })}
              />
            )}
          </div>
          <div>
            <Label htmlFor="cond-slot-conf" className="text-xs">
              Min confidence (1–10){' '}
              <FieldHelp title="Minimum confidence">
                <p>
                  Optionally require the slot value to be held at least this confidently (1–10)
                  before the gate counts. Leave blank to accept any confidence. Default:{' '}
                  <code>blank</code>.
                </p>
              </FieldHelp>
            </Label>
            <Input
              id="cond-slot-conf"
              data-testid="condition-slot-confidence"
              className="mt-1 h-9"
              inputMode="numeric"
              placeholder="optional"
              value={fields.minConfidence}
              onChange={(e) => update({ minConfidence: e.target.value })}
            />
          </div>
        </div>
      )}

      {fields.family === 'temporal' && (
        <div className="flex flex-col gap-2">
          <div>
            <Label htmlFor="cond-temporal-kind" className="text-xs">
              Temporal kind
            </Label>
            <select
              id="cond-temporal-kind"
              data-testid="condition-temporal-kind"
              className={cn(SELECT_CLASS, 'mt-1')}
              value={fields.kind}
              onChange={(e) => update({ kind: e.target.value as TemporalKind })}
            >
              {TEMPORAL_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {fields.kind === 'cooldown_since_last_visit' ? (
            <div>
              <Label htmlFor="cond-temporal-hours" className="text-xs">
                Cooldown (hours){' '}
                <FieldHelp title="Cooldown hours">
                  <p>
                    Hours that must pass since the user last visited before this edge reopens. Makes
                    a place repeatable on a timer.
                  </p>
                </FieldHelp>
              </Label>
              <Input
                id="cond-temporal-hours"
                data-testid="condition-temporal-hours"
                className="mt-1 h-9"
                inputMode="numeric"
                placeholder="e.g. 24"
                value={fields.durationHours}
                onChange={(e) => update({ durationHours: e.target.value })}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="cond-temporal-at" className="text-xs">
                Date / time (ISO-8601){' '}
                <FieldHelp title="Anchor instant">
                  <p>
                    An ISO-8601 instant, e.g. <code>2026-09-01T09:00:00Z</code> or with a local
                    offset <code>2026-09-01T09:00:00+02:00</code>. The engine compares it against
                    the simulated / real clock.
                  </p>
                </FieldHelp>
              </Label>
              <Input
                id="cond-temporal-at"
                data-testid="condition-temporal-at"
                className="mt-1 h-9"
                placeholder="2026-09-01T09:00:00Z"
                value={fields.at}
                onChange={(e) => update({ at: e.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {incomplete && (
        <p
          data-testid="condition-incomplete"
          className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          This condition is incomplete and won’t be saved as a gate until every field is valid.
        </p>
      )}
    </div>
  );
}

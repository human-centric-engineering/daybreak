'use client';

/**
 * PolicyKindFields (f-admin-surfaces t-2) — the per-kind payload editor for the four
 * `FacilitationPolicy` kinds.
 *
 * **Decision C build finding.** The plan asked whether f-module-config's A4
 * `describeConfigSchema` walker could drive these forms. It was evaluated against the
 * four payload schemas in `facilitation/policies/kinds.ts` and only cleanly serves
 * `auto_approval` (a single flat enum). The other three are genuinely nested — a
 * `scope`/`signal`/`match` object plus (for `relevance_gating`) a `role[]` array — which
 * the bounded walker degrades to raw-JSON textareas. Since the policy vocabulary is a
 * FIXED framework set of four (unlike open-ended module config) and every field is a
 * small enum or the bounded facilitation-role list, hand-built field sets give a far
 * better operator surface at modest size. So this renders purpose-built controls per
 * kind, sharing one declarative field spec — the reuse-over-reinvent call decision C
 * asked us to confirm at build (planning-retro B17).
 *
 * The client is a CONVENIENCE, never the trust boundary: it assembles a payload from the
 * controls and posts it; the server's `assertValidFacilitationPolicy` re-validates the
 * `(kind, payload)` pair and its field errors surface on the form.
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldHelp } from '@/components/ui/field-help';
import type { FacilitationPolicyKind } from '@/lib/framework/facilitation/policies/kinds';
import { FACILITATION_ROLE_VALUES } from '@/lib/framework/facilitation/agents/roles';
import { asRecord, str } from '@/components/admin/framework/policies/payload-utils';

/** The flat form state a kind's controls read/write. Nested payloads are assembled on submit. */
export type PolicyFieldState = Record<string, string | string[]>;

const GUARD_MODES = ['log_only', 'warn_and_continue', 'block'] as const;
const GUARD_NAMES = ['input', 'output', 'citation'] as const;
/** The sentinel for an unset optional select — a real value can never be empty. */
const UNSET = '';
/**
 * A non-empty sentinel value for the "Unset" option — Radix Select forbids an
 * empty-string item value, so the optional-enum control maps this back to `''`
 * (omit the field).
 */
const UNSET_OPTION = '__unset__';

/** A single control in a kind's field set. `roleMulti` is the only array-valued field. */
type PolicyField =
  | { key: string; label: string; help: string; control: 'text'; placeholder?: string }
  | { key: string; label: string; help: string; control: 'enum'; options: readonly string[] }
  | {
      key: string;
      label: string;
      help: string;
      control: 'optionalEnum';
      options: readonly string[];
    }
  | { key: string; label: string; help: string; control: 'roleSelect' }
  | { key: string; label: string; help: string; control: 'roleMulti' };

/**
 * The declarative field set per kind — the single source both the renderer and the
 * `payloadFrom*` builders below key on. Mirrors the payload schemas in `kinds.ts`.
 */
const FIELDS_BY_KIND: Record<FacilitationPolicyKind, PolicyField[]> = {
  auto_approval: [
    {
      key: 'autoApprove',
      label: 'Auto-approve',
      help: 'Which structure-change proposals may bypass human sign-off. "None" requires approval for every proposal; "Low risk" is reserved for a future risk taxonomy.',
      control: 'enum',
      options: ['none', 'low_risk'],
    },
  ],
  relevance_gating: [
    {
      key: 'graphSlug',
      label: 'Map slug',
      help: 'The facilitation map this gate applies to. It restricts which roles a user may reach on that map.',
      control: 'text',
      placeholder: 'onboarding-journey',
    },
    {
      key: 'matchStage',
      label: 'Match stage (optional)',
      help: 'Only apply the gate at this journey stage. Leave blank to match the whole map.',
      control: 'text',
    },
    {
      key: 'matchRegion',
      label: 'Match region (optional)',
      help: 'Only apply the gate in this map region. Leave blank to match the whole map.',
      control: 'text',
    },
    {
      key: 'allowedRoles',
      label: 'Allowed roles',
      help: 'The facilitation roles permitted where this gate applies. A role not listed yields no surface (404). At least one is required.',
      control: 'roleMulti',
    },
  ],
  guard_minimum: [
    {
      key: 'scopeId',
      label: 'Facilitation role',
      help: 'The facilitation role whose inline guards this floor applies to.',
      control: 'roleSelect',
    },
    {
      key: 'input',
      label: 'Input guard minimum',
      help: 'Raise the input guard to at least this mode. Leave unset to not floor it. A floor only ever raises a guard.',
      control: 'optionalEnum',
      options: GUARD_MODES,
    },
    {
      key: 'output',
      label: 'Output guard minimum',
      help: 'Raise the output guard to at least this mode. Leave unset to not floor it.',
      control: 'optionalEnum',
      options: GUARD_MODES,
    },
    {
      key: 'citation',
      label: 'Citation guard minimum',
      help: 'Raise the citation guard to at least this mode. Leave unset to not floor it. Provide at least one minimum.',
      control: 'optionalEnum',
      options: GUARD_MODES,
    },
  ],
  escalation: [
    {
      key: 'scopeId',
      label: 'Facilitation role',
      help: 'The facilitation role whose guard events trigger this escalation.',
      control: 'roleSelect',
    },
    {
      key: 'guard',
      label: 'Guard',
      help: 'Which inline guard firing triggers the escalation.',
      control: 'enum',
      options: GUARD_NAMES,
    },
    {
      key: 'outcome',
      label: 'Minimum outcome',
      help: 'The minimum severity to fire on: "flagged" = any detection; "blocked" = only a hard block.',
      control: 'enum',
      options: ['flagged', 'blocked'],
    },
    {
      key: 'priority',
      label: 'Priority',
      help: 'The priority of the escalation notification sent to a human reviewer.',
      control: 'enum',
      options: ['low', 'medium', 'high'],
    },
  ],
};

/**
 * The blank state for a kind's create form — every field empty. Total: an unknown kind
 * (a forward-compat DB row whose kind the UI doesn't yet model) yields `{}` rather than
 * throwing on `FIELDS_BY_KIND[kind]` being `undefined`.
 */
export function emptyPolicyState(kind: FacilitationPolicyKind): PolicyFieldState {
  const state: PolicyFieldState = {};
  for (const f of FIELDS_BY_KIND[kind] ?? []) {
    state[f.key] = f.control === 'roleMulti' ? [] : UNSET;
  }
  return state;
}

/**
 * Hydrate the flat form state from an existing policy `payload` (edit mode). Reads
 * defensively — a malformed stored payload (or an unknown/forward-compat kind) yields
 * blanks rather than throwing, and the server re-validates on save regardless.
 */
export function hydratePolicyState(
  kind: FacilitationPolicyKind,
  payload: unknown
): PolicyFieldState {
  const p = asRecord(payload);
  const state = emptyPolicyState(kind);

  switch (kind) {
    case 'auto_approval':
      state.autoApprove = str(p, 'autoApprove');
      return state;
    case 'relevance_gating': {
      const match = asRecord(p?.match);
      state.graphSlug = str(p, 'graphSlug');
      state.matchStage = str(match, 'stage');
      state.matchRegion = str(match, 'region');
      state.allowedRoles = Array.isArray(p?.allowedRoles)
        ? p.allowedRoles.filter((r): r is string => typeof r === 'string')
        : [];
      return state;
    }
    case 'guard_minimum': {
      const scope = asRecord(p?.scope);
      const minimums = asRecord(p?.minimums);
      state.scopeId = str(scope, 'id');
      state.input = str(minimums, 'input');
      state.output = str(minimums, 'output');
      state.citation = str(minimums, 'citation');
      return state;
    }
    case 'escalation': {
      const scope = asRecord(p?.scope);
      const signal = asRecord(p?.signal);
      state.scopeId = str(scope, 'id');
      state.guard = str(signal, 'guard');
      state.outcome = str(signal, 'outcome');
      state.priority = str(p, 'priority');
      return state;
    }
    default:
      // Unknown/forward-compat kind: the blank state (no fields to hydrate).
      return state;
  }
}

/** Value getter that treats the multi-role field as an array and the rest as strings. */
function s(state: PolicyFieldState, key: string): string {
  const v = state[key];
  return typeof v === 'string' ? v : '';
}

/**
 * The role checkboxes to render: the current vocabulary PLUS any already-selected role
 * that has since left the vocabulary — so a stored role removed in a later framework
 * version stays visible (and therefore un-checkable), rather than silently sticking in the
 * payload and failing the server's role validation on save with no UI path to remove it.
 */
function rolesFor(selected: string | string[]): string[] {
  const chosen = Array.isArray(selected) ? selected : [];
  const extra = chosen.filter((r) => !FACILITATION_ROLE_VALUES.includes(r));
  return [...FACILITATION_ROLE_VALUES, ...extra];
}

/**
 * Assemble the kind's nested payload from the flat form state (submit). Omits unset
 * optional fields so the server sees the exact discriminated-union shape. This is a
 * convenience shape only — the server re-validates it.
 */
export function payloadFromState(
  kind: FacilitationPolicyKind,
  state: PolicyFieldState
): Record<string, unknown> {
  switch (kind) {
    case 'auto_approval':
      return { autoApprove: s(state, 'autoApprove') };
    case 'relevance_gating': {
      const match: Record<string, string> = {};
      if (s(state, 'matchStage')) match.stage = s(state, 'matchStage');
      if (s(state, 'matchRegion')) match.region = s(state, 'matchRegion');
      const roles = state.allowedRoles;
      return {
        graphSlug: s(state, 'graphSlug'),
        match,
        allowedRoles: Array.isArray(roles) ? roles : [],
      };
    }
    case 'guard_minimum': {
      const minimums: Record<string, string> = {};
      for (const g of GUARD_NAMES) {
        if (s(state, g)) minimums[g] = s(state, g);
      }
      return {
        scope: { type: 'facilitation_role', id: s(state, 'scopeId') },
        minimums,
      };
    }
    case 'escalation':
      return {
        scope: { type: 'facilitation_role', id: s(state, 'scopeId') },
        signal: { guard: s(state, 'guard'), outcome: s(state, 'outcome') },
        priority: s(state, 'priority'),
      };
    default:
      // Unknown/forward-compat kind: no shape to assemble; the server rejects an empty payload.
      return {};
  }
}

interface PolicyKindFieldsProps {
  kind: FacilitationPolicyKind;
  state: PolicyFieldState;
  onChange: (next: PolicyFieldState) => void;
}

/** Render the controls for one kind, driven by `FIELDS_BY_KIND`. */
export function PolicyKindFields({ kind, state, onChange }: PolicyKindFieldsProps) {
  function set(key: string, value: string | string[]) {
    onChange({ ...state, [key]: value });
  }

  function toggleRole(role: string, checked: boolean) {
    const current = Array.isArray(state.allowedRoles) ? state.allowedRoles : [];
    set('allowedRoles', checked ? [...current, role] : current.filter((r) => r !== role));
  }

  return (
    <div className="space-y-4">
      {(FIELDS_BY_KIND[kind] ?? []).map((field) => {
        const id = `policy-${field.key}`;
        return (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={id}>{field.label}</Label>
              <FieldHelp title={field.label}>{field.help}</FieldHelp>
            </div>

            {field.control === 'text' && (
              <Input
                id={id}
                value={s(state, field.key)}
                onChange={(e) => set(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {field.control === 'enum' && (
              <Select value={s(state, field.key)} onValueChange={(v) => set(field.key, v)}>
                <SelectTrigger id={id} className="max-w-xs">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.control === 'optionalEnum' && (
              <Select
                value={s(state, field.key) || UNSET_OPTION}
                onValueChange={(v) => set(field.key, v === UNSET_OPTION ? UNSET : v)}
              >
                <SelectTrigger id={id} className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_OPTION}>Unset</SelectItem>
                  {field.options.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.control === 'roleSelect' && (
              <Select value={s(state, field.key)} onValueChange={(v) => set(field.key, v)}>
                <SelectTrigger id={id} className="max-w-xs">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {FACILITATION_ROLE_VALUES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.control === 'roleMulti' && (
              <div id={id} className="flex flex-wrap gap-x-4 gap-y-2">
                {rolesFor(state.allowedRoles).map((r) => {
                  const checked = Array.isArray(state.allowedRoles)
                    ? state.allowedRoles.includes(r)
                    : false;
                  return (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleRole(r, e.target.checked)}
                        aria-label={r}
                      />
                      {r}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

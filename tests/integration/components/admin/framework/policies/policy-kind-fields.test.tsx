/**
 * Integration test — PolicyKindFields helpers + controls (f-admin-surfaces t-2).
 *
 * Exercises the per-kind payload machinery directly: `emptyPolicyState` /
 * `hydratePolicyState` / `payloadFromState` across all four kinds (including malformed
 * stored payloads → blanks, not throws), plus the control interactions the form test
 * doesn't reach — the optional-enum "Unset" mapping, the match stage/region text fields,
 * and unchecking a role. The client shape is a convenience; the server re-validates.
 *
 * @see components/admin/framework/policies/policy-kind-fields.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  PolicyKindFields,
  emptyPolicyState,
  hydratePolicyState,
  payloadFromState,
  type PolicyFieldState,
} from '@/components/admin/framework/policies/policy-kind-fields';
import type { FacilitationPolicyKind } from '@/lib/framework/facilitation/policies/kinds';

// An unknown/forward-compat kind — a DB row whose kind the UI does not yet model.
const UNKNOWN_KIND = 'future_kind' as FacilitationPolicyKind;

describe('emptyPolicyState', () => {
  it('blanks every field, arrays for the multi-role field', () => {
    expect(emptyPolicyState('auto_approval')).toEqual({ autoApprove: '' });
    expect(emptyPolicyState('relevance_gating')).toEqual({
      graphSlug: '',
      matchStage: '',
      matchRegion: '',
      allowedRoles: [],
    });
    expect(emptyPolicyState('guard_minimum')).toEqual({
      scopeId: '',
      input: '',
      output: '',
      citation: '',
    });
    expect(emptyPolicyState('escalation')).toEqual({
      scopeId: '',
      guard: '',
      outcome: '',
      priority: '',
    });
  });
});

describe('hydratePolicyState', () => {
  it('reads an auto_approval payload', () => {
    expect(hydratePolicyState('auto_approval', { autoApprove: 'low_risk' })).toEqual({
      autoApprove: 'low_risk',
    });
  });

  it('reads a relevance_gating payload including the nested match + role array', () => {
    expect(
      hydratePolicyState('relevance_gating', {
        graphSlug: 'onboarding',
        match: { stage: 'intro', region: 'north' },
        allowedRoles: ['onboarding', 'path', 42],
      })
    ).toEqual({
      graphSlug: 'onboarding',
      matchStage: 'intro',
      matchRegion: 'north',
      // The non-string role is filtered out defensively.
      allowedRoles: ['onboarding', 'path'],
    });
  });

  it('reads a guard_minimum payload from the nested scope + minimums', () => {
    expect(
      hydratePolicyState('guard_minimum', {
        scope: { type: 'facilitation_role', id: 'facilitator' },
        minimums: { input: 'block', citation: 'warn_and_continue' },
      })
    ).toEqual({
      scopeId: 'facilitator',
      input: 'block',
      output: '',
      citation: 'warn_and_continue',
    });
  });

  it('reads an escalation payload from the nested scope + signal', () => {
    expect(
      hydratePolicyState('escalation', {
        scope: { type: 'facilitation_role', id: 'path' },
        signal: { guard: 'input', outcome: 'flagged' },
        priority: 'medium',
      })
    ).toEqual({ scopeId: 'path', guard: 'input', outcome: 'flagged', priority: 'medium' });
  });

  it('degrades a malformed payload to blanks instead of throwing', () => {
    expect(hydratePolicyState('escalation', null)).toEqual(emptyPolicyState('escalation'));
    expect(hydratePolicyState('relevance_gating', 'nonsense')).toEqual(
      emptyPolicyState('relevance_gating')
    );
    expect(hydratePolicyState('guard_minimum', { scope: 7, minimums: 'x' })).toEqual(
      emptyPolicyState('guard_minimum')
    );
  });

  it('is total for an unknown/forward-compat kind (no throw)', () => {
    // The wire type admits an unknown kind at runtime; the helpers must not crash on Edit.
    expect(emptyPolicyState(UNKNOWN_KIND)).toEqual({});
    expect(hydratePolicyState(UNKNOWN_KIND, { anything: 1 })).toEqual({});
    expect(payloadFromState(UNKNOWN_KIND, {})).toEqual({});
  });
});

describe('payloadFromState', () => {
  it('assembles auto_approval', () => {
    expect(payloadFromState('auto_approval', { autoApprove: 'none' })).toEqual({
      autoApprove: 'none',
    });
  });

  it('includes match stage/region only when set', () => {
    const withMatch = payloadFromState('relevance_gating', {
      graphSlug: 'g',
      matchStage: 'intro',
      matchRegion: 'north',
      allowedRoles: ['path'],
    });
    expect(withMatch).toEqual({
      graphSlug: 'g',
      match: { stage: 'intro', region: 'north' },
      allowedRoles: ['path'],
    });

    const noMatch = payloadFromState('relevance_gating', {
      graphSlug: 'g',
      matchStage: '',
      matchRegion: '',
      allowedRoles: [],
    });
    expect(noMatch).toEqual({ graphSlug: 'g', match: {}, allowedRoles: [] });
  });

  it('omits unset guard minimums', () => {
    expect(
      payloadFromState('guard_minimum', {
        scopeId: 'facilitator',
        input: 'block',
        output: '',
        citation: 'log_only',
      })
    ).toEqual({
      scope: { type: 'facilitation_role', id: 'facilitator' },
      minimums: { input: 'block', citation: 'log_only' },
    });
  });

  it('assembles the nested escalation payload', () => {
    expect(
      payloadFromState('escalation', {
        scopeId: 'path',
        guard: 'output',
        outcome: 'blocked',
        priority: 'high',
      })
    ).toEqual({
      scope: { type: 'facilitation_role', id: 'path' },
      signal: { guard: 'output', outcome: 'blocked' },
      priority: 'high',
    });
  });
});

describe('PolicyKindFields controls', () => {
  it('edits the relevance match text fields and unchecks a role', async () => {
    const user = userEvent.setup();
    let state: PolicyFieldState = hydratePolicyState('relevance_gating', {
      graphSlug: 'g',
      match: {},
      allowedRoles: ['onboarding', 'path'],
    });
    const onChange = vi.fn((next: PolicyFieldState) => {
      state = next;
    });

    const { rerender } = render(
      <PolicyKindFields kind="relevance_gating" state={state} onChange={onChange} />
    );

    // Uncheck the "path" role.
    await user.click(screen.getByRole('checkbox', { name: 'path' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedRoles: ['onboarding'] })
    );

    // Type into the optional match-stage field.
    rerender(<PolicyKindFields kind="relevance_gating" state={state} onChange={onChange} />);
    await user.type(screen.getByLabelText(/match stage/i), 'x');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ matchStage: 'x' }));
  });

  it('still renders a stored role that has left the vocabulary so it can be unchecked', async () => {
    const user = userEvent.setup();
    let state: PolicyFieldState = {
      graphSlug: 'g',
      matchStage: '',
      matchRegion: '',
      // 'legacy_role' is not in FACILITATION_ROLE_VALUES.
      allowedRoles: ['onboarding', 'legacy_role'],
    };
    const onChange = vi.fn((next: PolicyFieldState) => {
      state = next;
    });

    render(<PolicyKindFields kind="relevance_gating" state={state} onChange={onChange} />);

    const legacy = screen.getByRole('checkbox', { name: 'legacy_role' });
    expect(legacy).toBeChecked();
    await user.click(legacy);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedRoles: ['onboarding'] })
    );
  });

  it('renders nothing (no throw) for an unknown/forward-compat kind', () => {
    const { container } = render(
      <PolicyKindFields kind={UNKNOWN_KIND} state={{}} onChange={vi.fn()} />
    );
    // No field controls — just the empty wrapper.
    expect(container.querySelectorAll('input, [role="combobox"]')).toHaveLength(0);
  });

  it('maps the optional-enum "Unset" option back to an empty value', async () => {
    const user = userEvent.setup();
    let state: PolicyFieldState = hydratePolicyState('guard_minimum', {
      scope: { type: 'facilitation_role', id: 'facilitator' },
      minimums: { input: 'block' },
    });
    const onChange = vi.fn((next: PolicyFieldState) => {
      state = next;
    });

    render(<PolicyKindFields kind="guard_minimum" state={state} onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: /input guard minimum/i }));
    await user.click(await screen.findByRole('option', { name: /^unset$/i }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ input: '' }));
  });
});

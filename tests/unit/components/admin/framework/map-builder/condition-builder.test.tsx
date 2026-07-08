/**
 * ConditionBuilder (f-map-editor t-3) — the descriptor-driven gating-condition builder.
 * Proves it seeds from an existing condition, emits a *valid* `MapCondition` for each of
 * the three families as fields are filled, emits `undefined` while incomplete (with an
 * inline hint), and clears the gate on "none".
 *
 * @see components/admin/framework/map-builder/condition-builder.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConditionBuilder } from '@/components/admin/framework/map-builder/condition-builder';
import type { MapCondition } from '@/lib/framework/facilitation/map/schema';

function renderBuilder(condition?: MapCondition) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ConditionBuilder
      condition={condition}
      nodeKeys={['a', 'b']}
      slotOptions={['mood']}
      onChange={onChange}
    />
  );
  return { onChange, user };
}

describe('ConditionBuilder', () => {
  it('defaults to "none" with no sub-fields', () => {
    renderBuilder();
    expect(screen.getByTestId('condition-family')).toHaveValue('none');
    expect(screen.queryByTestId('condition-milestone')).not.toBeInTheDocument();
  });

  it('flags an incomplete condition and emits undefined until it is valid', async () => {
    const { onChange, user } = renderBuilder();
    await user.selectOptions(screen.getByTestId('condition-family'), 'state');
    expect(screen.getByTestId('condition-incomplete')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('emits a valid state condition once the milestone is set', async () => {
    const { onChange, user } = renderBuilder();
    await user.selectOptions(screen.getByTestId('condition-family'), 'state');
    await user.type(screen.getByTestId('condition-milestone'), 'a');
    expect(onChange).toHaveBeenLastCalledWith({ family: 'state', milestone: 'a', reached: true });
  });

  it('emits a valid slot condition with a numeric threshold', async () => {
    const { onChange, user } = renderBuilder();
    await user.selectOptions(screen.getByTestId('condition-family'), 'slot');
    await user.type(screen.getByTestId('condition-slot-slug'), 'mood');
    await user.type(screen.getByTestId('condition-slot-value'), '5');
    expect(onChange).toHaveBeenLastCalledWith({
      family: 'slot',
      slug: 'mood',
      op: 'gte',
      value: 5,
    });
  });

  it('coerces a boolean slot value from the value-type toggle', async () => {
    const { onChange, user } = renderBuilder();
    await user.selectOptions(screen.getByTestId('condition-family'), 'slot');
    await user.type(screen.getByTestId('condition-slot-slug'), 'active');
    await user.selectOptions(screen.getByTestId('condition-slot-type'), 'boolean');
    await user.selectOptions(screen.getByTestId('condition-slot-value'), 'true');
    expect(onChange).toHaveBeenLastCalledWith({
      family: 'slot',
      slug: 'active',
      op: 'gte',
      value: true,
    });
  });

  it('emits a temporal cooldown from its hours field', async () => {
    const { onChange, user } = renderBuilder();
    await user.selectOptions(screen.getByTestId('condition-family'), 'temporal');
    await user.selectOptions(
      screen.getByTestId('condition-temporal-kind'),
      'cooldown_since_last_visit'
    );
    await user.type(screen.getByTestId('condition-temporal-hours'), '24');
    expect(onChange).toHaveBeenLastCalledWith({
      family: 'temporal',
      kind: 'cooldown_since_last_visit',
      durationHours: 24,
    });
  });

  it('seeds its fields from an existing condition', () => {
    renderBuilder({ family: 'slot', slug: 'streak', op: 'lte', value: 3 });
    expect(screen.getByTestId('condition-family')).toHaveValue('slot');
    expect(screen.getByTestId('condition-slot-slug')).toHaveValue('streak');
    expect(screen.getByTestId('condition-slot-op')).toHaveValue('lte');
    expect(screen.getByTestId('condition-slot-value')).toHaveValue('3');
  });

  it('clears the gate on "none"', async () => {
    const { onChange, user } = renderBuilder({ family: 'state', milestone: 'a', reached: true });
    await user.selectOptions(screen.getByTestId('condition-family'), 'none');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

/**
 * Module liveness unit tests (spec §4.1, decision A5).
 *
 * `isModuleLive` is pure and total, so we exhaust the permutation matrix:
 * status × feature-flag × availability-window × entitlement, plus the inclusive
 * window boundary instants and the most-fundamental-first `reason` ordering.
 */

import { describe, it, expect, vi } from 'vitest';
import { isModuleLive, type ModuleLivenessFields } from '@/lib/framework/modules/liveness';
import { MODULE_STATUS } from '@/lib/framework/modules/status';

const NOW = new Date('2026-07-03T12:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T23:59:59.000Z');

/** A fully-open, live-by-default module; override one field per case. */
function mod(overrides: Partial<ModuleLivenessFields> = {}): ModuleLivenessFields {
  return {
    status: MODULE_STATUS.active,
    featureFlagName: null,
    availableFrom: null,
    availableUntil: null,
    ...overrides,
  };
}

describe('isModuleLive', () => {
  it('is live when every gate is open (active, no flag, no window, no entitlement)', () => {
    expect(isModuleLive(mod(), {}, NOW)).toEqual({ live: true });
  });

  describe('status gate', () => {
    it.each([MODULE_STATUS.draft, MODULE_STATUS.scheduled, MODULE_STATUS.retired, 'anything-else'])(
      'is not live when status is %s',
      (status) => {
        expect(isModuleLive(mod({ status }), {}, NOW)).toEqual({ live: false, reason: 'status' });
      }
    );

    it('is live only for the active status', () => {
      expect(isModuleLive(mod({ status: MODULE_STATUS.active }), {}, NOW)).toEqual({ live: true });
    });
  });

  describe('feature-flag gate', () => {
    it('is live when a bound flag is enabled', () => {
      expect(isModuleLive(mod({ featureFlagName: 'beta' }), { beta: true }, NOW)).toEqual({
        live: true,
      });
    });

    it('is not live when a bound flag is disabled', () => {
      expect(isModuleLive(mod({ featureFlagName: 'beta' }), { beta: false }, NOW)).toEqual({
        live: false,
        reason: 'flag',
      });
    });

    it('is not live when a bound flag is absent from the resolved map', () => {
      expect(isModuleLive(mod({ featureFlagName: 'beta' }), {}, NOW)).toEqual({
        live: false,
        reason: 'flag',
      });
    });

    it('ignores flags for an unbound module (featureFlagName null)', () => {
      expect(isModuleLive(mod({ featureFlagName: null }), { beta: false }, NOW)).toEqual({
        live: true,
      });
    });
  });

  describe('availability window gate', () => {
    it('is not live before availableFrom', () => {
      expect(isModuleLive(mod({ availableFrom: FUTURE }), {}, NOW)).toEqual({
        live: false,
        reason: 'window',
      });
    });

    it('is live after availableFrom', () => {
      expect(isModuleLive(mod({ availableFrom: PAST }), {}, NOW)).toEqual({ live: true });
    });

    it('is not live after availableUntil', () => {
      expect(isModuleLive(mod({ availableUntil: PAST }), {}, NOW)).toEqual({
        live: false,
        reason: 'window',
      });
    });

    it('is live before availableUntil', () => {
      expect(isModuleLive(mod({ availableUntil: FUTURE }), {}, NOW)).toEqual({ live: true });
    });

    it('is live within a bounded window', () => {
      expect(isModuleLive(mod({ availableFrom: PAST, availableUntil: FUTURE }), {}, NOW)).toEqual({
        live: true,
      });
    });

    it('treats the window as inclusive: now === availableFrom is live', () => {
      expect(isModuleLive(mod({ availableFrom: NOW }), {}, NOW)).toEqual({ live: true });
    });

    it('treats the window as inclusive: now === availableUntil is live', () => {
      expect(isModuleLive(mod({ availableUntil: NOW }), {}, NOW)).toEqual({ live: true });
    });
  });

  describe('entitlement gate (C1)', () => {
    it('is live when no entitlement predicate is supplied (single-tier default)', () => {
      expect(isModuleLive(mod(), {}, NOW, undefined)).toEqual({ live: true });
    });

    it('is live when the entitlement predicate returns true', () => {
      expect(isModuleLive(mod(), {}, NOW, () => true)).toEqual({ live: true });
    });

    it('is not live when the entitlement predicate returns false', () => {
      expect(isModuleLive(mod(), {}, NOW, () => false)).toEqual({
        live: false,
        reason: 'entitlement',
      });
    });

    it('evaluates the entitlement predicate lazily — not called when an earlier gate fails', () => {
      const entitlement = vi.fn(() => true);
      const result = isModuleLive(mod({ status: MODULE_STATUS.draft }), {}, NOW, entitlement);
      expect(result).toEqual({ live: false, reason: 'status' });
      expect(entitlement).not.toHaveBeenCalled();
    });
  });

  describe('reason is the first failing gate (most-fundamental first)', () => {
    it('reports status when status, flag, window, and entitlement all fail', () => {
      const result = isModuleLive(
        mod({ status: MODULE_STATUS.draft, featureFlagName: 'beta', availableFrom: FUTURE }),
        { beta: false },
        NOW,
        () => false
      );
      expect(result).toEqual({ live: false, reason: 'status' });
    });

    it('reports flag when status passes but flag, window, and entitlement fail', () => {
      const result = isModuleLive(
        mod({ featureFlagName: 'beta', availableFrom: FUTURE }),
        { beta: false },
        NOW,
        () => false
      );
      expect(result).toEqual({ live: false, reason: 'flag' });
    });

    it('reports window when status and flag pass but window and entitlement fail', () => {
      const result = isModuleLive(
        mod({ featureFlagName: 'beta', availableFrom: FUTURE }),
        { beta: true },
        NOW,
        () => false
      );
      expect(result).toEqual({ live: false, reason: 'window' });
    });

    it('reports entitlement only when status, flag, and window all pass', () => {
      const result = isModuleLive(
        mod({ featureFlagName: 'beta', availableFrom: PAST }),
        { beta: true },
        NOW,
        () => false
      );
      expect(result).toEqual({ live: false, reason: 'entitlement' });
    });
  });
});

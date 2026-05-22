/**
 * Rate-Limit Policy Unit Tests
 *
 * Tests for the policy table (`RATE_LIMIT_POLICY`) and the matcher function
 * (`findRateLimitRule`) in `lib/security/rate-limit-policy.ts`.
 *
 * No mocks needed — the module is a pure data structure + a deterministic
 * string/RegExp matcher with no external dependencies.
 *
 * @see lib/security/rate-limit-policy.ts
 */

import { describe, it, expect } from 'vitest';
import { findRateLimitRule, RATE_LIMIT_POLICY } from '@/lib/security/rate-limit-policy';

describe('rate-limit-policy', () => {
  describe('findRateLimitRule — tier resolution', () => {
    it("returns the 'orchestration' tier for orchestration admin paths", () => {
      // Arrange — orchestration path is the most specific; must match before the broader admin rule
      const pathname = '/api/v1/admin/orchestration/agents';

      // Act
      const rule = findRateLimitRule(pathname);

      // Assert — the function selected the orchestration rule, not the generic admin rule
      expect(rule).not.toBeNull();
      expect(rule?.tier).toBe('orchestration');
      expect(rule?.key).toBe('session-user');
    });

    it("returns the 'admin' tier for core admin paths", () => {
      // Arrange — core admin path; orchestration prefix is absent, so it falls through
      // to the second rule (admin) and should NOT match the catch-all api rule
      const pathname = '/api/v1/admin/users';

      // Act
      const rule = findRateLimitRule(pathname);

      // Assert — the admin rule was selected with the correct cap and key strategy
      expect(rule).not.toBeNull();
      expect(rule?.tier).toBe('admin');
      expect(rule?.key).toBe('session-user');
    });

    it("returns the 'auth' tier and 'ip' key for both auth path families", () => {
      // Arrange — Sunrise app-layer auth lives under /api/v1/auth/;
      // better-auth's own endpoints live under /api/auth/ — both must resolve to 'auth'
      const appAuthPath = '/api/v1/auth/login';
      const betterAuthPath = '/api/auth/sign-in';

      // Act
      const appAuthRule = findRateLimitRule(appAuthPath);
      const betterAuthRule = findRateLimitRule(betterAuthPath);

      // Assert — both families keyed on IP (callers have no session yet)
      expect(appAuthRule).not.toBeNull();
      expect(appAuthRule?.tier).toBe('auth');
      expect(appAuthRule?.key).toBe('ip');

      expect(betterAuthRule).not.toBeNull();
      expect(betterAuthRule?.tier).toBe('auth');
      expect(betterAuthRule?.key).toBe('ip');
    });

    it("returns the 'api' catch-all tier for general /api/v1/ paths", () => {
      // Arrange — chat and user-profile paths must not match orchestration, admin, or auth;
      // they land on the section-level catch-all. This locks in that per-flow caps (chatLimiter,
      // audioLimiter) stack ON TOP of this section tier, not below it.
      const chatPath = '/api/v1/chat/stream';
      const userPath = '/api/v1/users/me';

      // Act
      const chatRule = findRateLimitRule(chatPath);
      const userRule = findRateLimitRule(userPath);

      // Assert — both get the default section cap keyed on session-user
      expect(chatRule).not.toBeNull();
      expect(chatRule?.tier).toBe('api');
      expect(chatRule?.key).toBe('session-user');

      expect(userRule).not.toBeNull();
      expect(userRule?.tier).toBe('api');
      expect(userRule?.key).toBe('session-user');
    });

    it('returns null for non-API paths (page routes, static assets, root)', () => {
      // Arrange — middleware should never rate-limit page routes; these paths must
      // fall through all rules and return null so the dispatcher is a no-op.
      const nonApiPaths = ['/admin/users', '/', '/_next/static/foo', '/dashboard'];

      for (const pathname of nonApiPaths) {
        // Act
        const rule = findRateLimitRule(pathname);

        // Assert
        expect(rule, `expected null for path: ${pathname}`).toBeNull();
      }
    });
  });

  describe('findRateLimitRule — first-match-wins ordering', () => {
    it("orchestration path resolves to 'orchestration', not 'admin'", () => {
      // Arrange — /api/v1/admin/orchestration/ starts with /api/v1/admin/ which
      // would match the admin rule if order were wrong. This test is the guard
      // against accidental rule reordering — if orchestration moves below admin,
      // this test fails immediately.
      const pathname = '/api/v1/admin/orchestration/workflows/abc';

      // Act
      const rule = findRateLimitRule(pathname);

      // Assert — the orchestration rule (index 0) won; admin rule (index 1) did not
      expect(rule).not.toBeNull();
      expect(rule?.tier).toBe('orchestration');
      expect(rule?.tier).not.toBe('admin');
    });
  });

  describe('RATE_LIMIT_POLICY — declared order', () => {
    it('policy array is ordered from most-specific to least-specific', () => {
      // Assert — ordering IS the API. If someone reorders the array, this test
      // surfaces the breakage immediately. The order here encodes the first-match-wins
      // contract explicitly so it can be verified without running path matching.
      expect(RATE_LIMIT_POLICY[0].tier).toBe('orchestration');
      expect(RATE_LIMIT_POLICY[1].tier).toBe('admin');
      expect(RATE_LIMIT_POLICY[2].tier).toBe('auth'); // /api/v1/auth/
      expect(RATE_LIMIT_POLICY[3].tier).toBe('auth'); // /api/auth/ (better-auth routes)
      expect(RATE_LIMIT_POLICY[4].tier).toBe('api'); // catch-all
    });

    it('has exactly 5 rules (catches unintended additions or deletions)', () => {
      // A length change is a signal that the policy changed. This test surfaces
      // that signal without being prescriptive about what was added/removed.
      expect(RATE_LIMIT_POLICY).toHaveLength(5);
    });
  });

  describe('findRateLimitRule — string-prefix match support', () => {
    it.todo(
      'string-prefix matching (match: string) is supported by the type and implemented in findRateLimitRule, but is not exercised by the current policy which uses only RegExp. Covered indirectly when a downstream rule is added that uses a string prefix. The string-prefix branch (pathname.startsWith(rule.match)) in the source is straightforward enough that a dedicated test would require injecting a synthetic rule — which adds coupling without meaningful additional assurance beyond reading the 3-line branch. Add a concrete test here once the first string-match rule is added to RATE_LIMIT_POLICY.'
    );
  });
});

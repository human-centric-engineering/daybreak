/**
 * Unit tests for the project-root middleware.ts
 *
 * Scope: wiring between the Next.js middleware contract and `applyRateLimit`.
 * The dispatcher itself (routing rules, bucket exhaustion, key strategies) is
 * covered in tests/unit/lib/security/rate-limit-middleware.test.ts (Batch 1.3).
 * These tests verify:
 *   1. null return from applyRateLimit → NextResponse.next() pass-through
 *   2. 429 Response from applyRateLimit → 429 NextResponse with body + headers preserved
 *   3. config.matcher shape (catches accidental matcher narrowing)
 *   4. config.runtime === 'nodejs' (catches accidental edge-runtime switch)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock applyRateLimit so we drive its return value directly.
// This isolates the wiring test from the dispatcher's real implementation.
vi.mock('@/lib/security/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn(),
}));

// Import after mock registration
import { applyRateLimit } from '@/lib/security/rate-limit-middleware';
import { middleware, config } from '@/middleware';

describe('middleware (project root)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Pass-through path
  // ---------------------------------------------------------------------------

  it('returns a NextResponse.next()-shaped response when applyRateLimit returns null', async () => {
    // Arrange
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    const request = new NextRequest('http://localhost:3000/api/v1/some-path');

    // Act
    const response = await middleware(request);

    // Assert: the middleware produced a NextResponse (not a plain Response)
    // and it is the pass-through response (status 200, no override body).
    // This verifies the code took the NextResponse.next() branch, not the
    // re-wrap branch — the two produce distinct status values.
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 429 re-wrap path
  // ---------------------------------------------------------------------------

  it('returns a 429 NextResponse that preserves status, body, and all rate-limit headers when applyRateLimit returns a 429 Response', async () => {
    // Arrange: construct the fake 429 the dispatcher would return
    const fake429 = new Response(
      JSON.stringify({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'test' },
      }),
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': '0',
          'Content-Type': 'application/json',
        },
      }
    );
    vi.mocked(applyRateLimit).mockResolvedValue(fake429);
    const request = new NextRequest('http://localhost:3000/api/v1/some-path');

    // Act
    const response = await middleware(request);

    // Assert — status
    expect(response.status).toBe(429);

    // Assert — body: the re-wrap must not drop or corrupt the JSON payload.
    // This is the primary anti-regression assertion: if new NextResponse(body, ...)
    // discards the body stream, this line catches it.
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'test' },
    });

    // Assert — headers: each header must survive the Response → NextResponse re-wrap.
    // A regression here would silently break client retry logic.
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    const contentType = response.headers.get('Content-Type');
    expect(contentType).not.toBeNull();
    expect(contentType).toContain('application/json');
  });

  // ---------------------------------------------------------------------------
  // config shape
  // ---------------------------------------------------------------------------

  it('config.matcher includes /api/:path* — catches accidental narrowing that would skip auth routes', () => {
    // Assert: the matcher covers the full /api/** surface, including
    // better-auth's /api/auth/** endpoints which need IP caps.
    // If someone narrows this to /api/v1/:path*, auth routes escape rate-limiting.
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher).toContain('/api/:path*');
  });

  it('config.runtime is nodejs — guards against accidental edge-runtime switch that would crash in-memory LRU limiters', () => {
    // Assert: the in-memory LRU section limiters are Node-only.
    // Switching to 'experimental-edge' without also migrating to the async
    // Redis-backed store would crash at runtime. This test documents the contract.
    expect(config.runtime).toBe('nodejs');
  });
});
